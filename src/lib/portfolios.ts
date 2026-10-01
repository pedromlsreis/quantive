/**
 * Extra portfolios (Family plan): list, open, create, save, delete.
 * Spec: docs/security/encryption.md §5.2, §9.3. The personal portfolio keeps its
 * own path in cloudSync.ts.
 *
 * An extra portfolio's blob is the PortfolioData JSON plus the portfolio's
 * name, encrypted under the portfolio's own key (PK). Each member holds the
 * PK wrapped under their DK. This module does the I/O and crypto;
 * PortfolioContext owns the state.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import {
  decryptPortfolio,
  encryptPortfolio,
  generatePortfolioKey,
  unwrapPortfolioKey,
  wrapPortfolioKey,
} from '@/lib/crypto';
import { toIsoDate } from '@/lib/fxConvert';
import { byteaToBytes, bytesToBytea } from '@/lib/keySession/bytea';
import type { RotateOutcome } from '@/lib/portfolioSync';
import type { PortfolioData } from '@/lib/types';
import { CONTROL_CHAR_RE } from '@/lib/utils';

type Client = SupabaseClient<Database>;

export const PERSONAL_PORTFOLIO_ID = 'personal';
export const PERSONAL_PORTFOLIO_NAME = 'Personal';
/** Mirrors the cap in create_portfolio (migration 20260930120000). */
export const MAX_EXTRA_PORTFOLIOS = 5;
export const PORTFOLIO_NAME_MAX_LENGTH = 60;

export interface ExtraPortfolioMeta {
  id: string;
  name: string;
  ownerId: string;
  revision: number;
  keyEpoch: number;
  /** A partner left or was removed. The owner's browser rotates the key on its next load. */
  rotationDue: boolean;
}

export interface LoadedPortfolio {
  meta: ExtraPortfolioMeta;
  portfolioKey: Uint8Array;
  /** The decrypted JSON without its name. Normalised by the caller. */
  content: Record<string, unknown>;
}

export type SaveOutcome =
  | { status: 'ok'; revision: number }
  | { status: 'conflict'; revision: number | null }
  | { status: 'forbidden' };

export class PortfolioLimitError extends Error {
  constructor() {
    super('portfolio_limit');
    this.name = 'PortfolioLimitError';
  }
}

export function sanitizePortfolioName(raw: string): { value: string; error: string | null } {
  if (CONTROL_CHAR_RE.test(raw)) return { value: raw.trim(), error: "That name contains characters that can't be used." };
  const value = raw.trim().replace(/\s+/g, ' ');
  if (!value) return { value, error: 'Give the portfolio a name.' };
  if (value.length > PORTFOLIO_NAME_MAX_LENGTH) {
    return { value, error: `Keep the name to ${PORTFOLIO_NAME_MAX_LENGTH} characters or fewer.` };
  }
  return { value, error: null };
}

/**
 * Filename fragment for exports, e.g. "_joint" in portfolio_joint_2026-10-01.csv.
 * Empty for the personal portfolio, so its filenames stay as they were.
 */
export function portfolioFileSuffix(portfolioId: string, name: string): string {
  if (portfolioId === PERSONAL_PORTFOLIO_ID) return '';
  const slug = name
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return slug ? `_${slug}` : '';
}

/** Case-insensitive clash with "Personal" or another extra portfolio. */
export function portfolioNameTaken(name: string, existing: readonly ExtraPortfolioMeta[], exceptId?: string): boolean {
  const lower = name.toLowerCase();
  if (lower === PERSONAL_PORTFOLIO_NAME.toLowerCase()) return true;
  return existing.some((p) => p.id !== exceptId && p.name.toLowerCase() === lower);
}

const EMPTY_CONTENT: PortfolioData = { facts: [], refSources: [], goals: [] };

function encodeContent(name: string, data: PortfolioData | null): Uint8Array {
  const content = data ?? EMPTY_CONTENT;
  // Calendar days, not timestamps: a partner in another time zone would read
  // a local-midnight timestamp as the day before or after. The reader parses
  // YYYY-MM-DD as local midnight (PortfolioContext's safeDate).
  const facts = content.facts.map((f) => ({ ...f, date: toIsoDate(f.date) }));
  return new TextEncoder().encode(JSON.stringify({ ...content, facts, name }));
}

function decodeContent(bytes: Uint8Array): { name: string; content: Record<string, unknown> } {
  const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes));
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('portfolio blob is not a JSON object');
  }
  const { name, ...content } = parsed as Record<string, unknown>;
  return { name: typeof name === 'string' && name.trim() ? name : 'Untitled', content };
}

interface PortfolioRow {
  id: string;
  owner_id: string;
  encrypted_data: string;
  nonce: string;
  enc_version: number;
  revision: number;
  key_epoch: number;
  rotation_due: boolean;
  created_at: string;
}

interface MemberRow {
  wrapped_pk: string;
  key_epoch: number;
  portfolios: PortfolioRow | null;
}

const MEMBER_SELECT =
  'wrapped_pk, key_epoch, portfolios(id, owner_id, encrypted_data, nonce, enc_version, revision, key_epoch, rotation_due, created_at)';

async function openPortfolio(member: MemberRow & { portfolios: PortfolioRow }, userId: string, dataKey: Uint8Array): Promise<LoadedPortfolio> {
  const row = member.portfolios;
  // The wrap and the blob carry their own epochs. They differ only if a key
  // rotation landed between the two, which makes the unwrap or decrypt fail.
  const portfolioKey = await unwrapPortfolioKey({
    wrappedPk: byteaToBytes(member.wrapped_pk),
    dataKey,
    userId,
    portfolioId: row.id,
    keyEpoch: member.key_epoch,
  });
  const plaintext = await decryptPortfolio({
    encrypted: {
      ciphertext: byteaToBytes(row.encrypted_data),
      nonce: byteaToBytes(row.nonce),
      encVersion: row.enc_version,
    },
    portfolioKey,
    portfolioId: row.id,
    keyEpoch: row.key_epoch,
  });
  const { name, content } = decodeContent(plaintext);
  return {
    meta: {
      id: row.id,
      name,
      ownerId: row.owner_id,
      revision: row.revision,
      keyEpoch: row.key_epoch,
      rotationDue: row.rotation_due,
    },
    portfolioKey,
    content,
  };
}

/**
 * Every extra portfolio the user is a member of, oldest first. One that
 * can't be opened is skipped and counted, so it can't hide the others.
 */
export async function listPortfolios(
  client: Client,
  userId: string,
  dataKey: Uint8Array,
): Promise<{ loaded: LoadedPortfolio[]; failed: number }> {
  const { data, error } = await client.from('portfolio_members').select(MEMBER_SELECT).eq('user_id', userId);
  if (error) throw error;
  const members = ((data ?? []) as unknown as MemberRow[])
    .filter((m): m is MemberRow & { portfolios: PortfolioRow } => m.portfolios !== null)
    .sort((a, b) => a.portfolios.created_at.localeCompare(b.portfolios.created_at));

  const loaded: LoadedPortfolio[] = [];
  let failed = 0;
  for (const member of members) {
    try {
      loaded.push(await openPortfolio(member, userId, dataKey));
    } catch (e) {
      failed += 1;
      console.error(`[portfolios] couldn't open ${member.portfolios.id}:`, e);
    }
  }
  return { loaded, failed };
}

/** One portfolio, freshly read. null when it no longer exists or the user isn't a member. */
export async function fetchPortfolio(
  client: Client,
  userId: string,
  dataKey: Uint8Array,
  portfolioId: string,
): Promise<LoadedPortfolio | null> {
  const { data, error } = await client
    .from('portfolio_members')
    .select(MEMBER_SELECT)
    .eq('user_id', userId)
    .eq('portfolio_id', portfolioId)
    .maybeSingle();
  if (error) throw error;
  const member = data as unknown as MemberRow | null;
  if (!member?.portfolios) return null;
  return openPortfolio(member as MemberRow & { portfolios: PortfolioRow }, userId, dataKey);
}

export async function createPortfolio(
  client: Client,
  userId: string,
  dataKey: Uint8Array,
  name: string,
): Promise<LoadedPortfolio> {
  const id = crypto.randomUUID();
  const portfolioKey = await generatePortfolioKey();
  const wrappedPk = await wrapPortfolioKey({ portfolioKey, dataKey, userId, portfolioId: id, keyEpoch: 1 });
  const encrypted = await encryptPortfolio({ plaintext: encodeContent(name, null), portfolioKey, portfolioId: id, keyEpoch: 1 });

  const { error } = await client.rpc('create_portfolio', {
    p_id: id,
    p_wrapped_pk: bytesToBytea(wrappedPk),
    p_encrypted_data: bytesToBytea(encrypted.ciphertext),
    p_nonce: bytesToBytea(encrypted.nonce),
    p_enc_version: encrypted.encVersion,
  });
  if (error) {
    if (error.message?.includes('portfolio_limit')) throw new PortfolioLimitError();
    throw error;
  }
  return {
    meta: { id, name, ownerId: userId, revision: 1, keyEpoch: 1, rotationDue: false },
    portfolioKey,
    content: { ...EMPTY_CONTENT },
  };
}

/** Compare-and-swap write of the whole blob against `meta.revision`. */
export async function savePortfolio(
  client: Client,
  args: { meta: ExtraPortfolioMeta; portfolioKey: Uint8Array; data: PortfolioData | null },
): Promise<SaveOutcome> {
  const { meta, portfolioKey, data } = args;
  const encrypted = await encryptPortfolio({
    plaintext: encodeContent(meta.name, data),
    portfolioKey,
    portfolioId: meta.id,
    keyEpoch: meta.keyEpoch,
  });
  const { data: rows, error } = await client.rpc('save_portfolio', {
    p_id: meta.id,
    p_expected_revision: meta.revision,
    p_key_epoch: meta.keyEpoch,
    p_encrypted_data: bytesToBytea(encrypted.ciphertext),
    p_nonce: bytesToBytea(encrypted.nonce),
    p_enc_version: encrypted.encVersion,
  });
  if (error) throw error;
  const row = rows?.[0];
  if (!row) throw new Error('save_portfolio returned no row');
  if (row.status === 'ok' && row.current_revision !== null) return { status: 'ok', revision: row.current_revision };
  if (row.status === 'conflict') return { status: 'conflict', revision: row.current_revision };
  if (row.status === 'forbidden') return { status: 'forbidden' };
  throw new Error(`unexpected save_portfolio status: ${row.status}`);
}

/** Owner only (RLS). Member rows go with it. */
export async function deletePortfolio(client: Client, portfolioId: string): Promise<void> {
  const { data, error } = await client.from('portfolios').delete().eq('id', portfolioId).select('id');
  if (error) throw error;
  if (!data || data.length === 0) throw new Error('portfolio not deleted: not found or not the owner');
}

/**
 * Re-encrypts the portfolio under a fresh key at the next epoch and replaces
 * the owner's wrap (encryption.md §8.9). Resolves with the new key on
 * success; on any other outcome the new key is zeroed and null.
 */
export async function rotatePortfolioKey(
  client: Client,
  args: { meta: ExtraPortfolioMeta; userId: string; dataKey: Uint8Array; data: PortfolioData | null },
): Promise<{ outcome: RotateOutcome; portfolioKey: Uint8Array | null }> {
  const { meta, userId, dataKey, data } = args;
  const keyEpoch = meta.keyEpoch + 1;
  const portfolioKey = await generatePortfolioKey();
  let keep = false;
  try {
    const wrappedPk = await wrapPortfolioKey({ portfolioKey, dataKey, userId, portfolioId: meta.id, keyEpoch });
    const encrypted = await encryptPortfolio({ plaintext: encodeContent(meta.name, data), portfolioKey, portfolioId: meta.id, keyEpoch });
    const { data: rows, error } = await client.rpc('rotate_portfolio_key', {
      p_id: meta.id,
      p_expected_revision: meta.revision,
      p_expected_epoch: meta.keyEpoch,
      p_encrypted_data: bytesToBytea(encrypted.ciphertext),
      p_nonce: bytesToBytea(encrypted.nonce),
      p_enc_version: encrypted.encVersion,
      p_owner_wrapped_pk: bytesToBytea(wrappedPk),
    });
    if (error) throw error;
    const row = rows?.[0];
    if (row?.status === 'ok' && row.current_revision !== null && row.current_epoch !== null) {
      keep = true;
      return { outcome: { status: 'ok', revision: row.current_revision, keyEpoch: row.current_epoch }, portfolioKey };
    }
    if (row?.status === 'conflict' || row?.status === 'members_remain' || row?.status === 'forbidden') {
      return { outcome: { status: row.status }, portfolioKey: null };
    }
    throw new Error(`unexpected rotate_portfolio_key status: ${row?.status}`);
  } finally {
    if (!keep) portfolioKey.fill(0);
  }
}

export interface PortfolioRevision {
  revision: number;
  keyEpoch: number;
  savedBy: string | null;
  savedAt: string;
}

/** Earlier versions a save replaced, newest first. At most 20 are kept. */
export async function listRevisions(client: Client, portfolioId: string): Promise<PortfolioRevision[]> {
  const { data, error } = await client
    .from('portfolio_revisions')
    .select('revision, key_epoch, saved_by, saved_at')
    .eq('portfolio_id', portfolioId)
    .order('revision', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => ({ revision: r.revision, keyEpoch: r.key_epoch, savedBy: r.saved_by, savedAt: r.saved_at }));
}

/**
 * Decrypts one earlier version. A version from before a key rotation needs
 * the retired key, which only the owner keeps (portfolio_key_history).
 * Resolves with the content without its name, like LoadedPortfolio.content.
 */
export async function openRevision(
  client: Client,
  args: { userId: string; dataKey: Uint8Array; meta: ExtraPortfolioMeta; currentKey: Uint8Array; revision: number },
): Promise<Record<string, unknown>> {
  const { userId, dataKey, meta, currentKey, revision } = args;
  const { data: row, error } = await client
    .from('portfolio_revisions')
    .select('key_epoch, encrypted_data, nonce, enc_version')
    .eq('portfolio_id', meta.id)
    .eq('revision', revision)
    .single();
  if (error) throw error;

  let retired: Uint8Array | null = null;
  if (row.key_epoch !== meta.keyEpoch) {
    const { data: wrap, error: wrapError } = await client
      .from('portfolio_key_history')
      .select('wrapped_pk')
      .eq('portfolio_id', meta.id)
      .eq('key_epoch', row.key_epoch)
      .eq('user_id', userId)
      .single();
    if (wrapError) throw wrapError;
    retired = await unwrapPortfolioKey({
      wrappedPk: byteaToBytes(wrap.wrapped_pk),
      dataKey,
      userId,
      portfolioId: meta.id,
      keyEpoch: row.key_epoch,
    });
  }
  try {
    const plaintext = await decryptPortfolio({
      encrypted: { ciphertext: byteaToBytes(row.encrypted_data), nonce: byteaToBytes(row.nonce), encVersion: row.enc_version },
      portfolioKey: retired ?? currentKey,
      portfolioId: meta.id,
      keyEpoch: row.key_epoch,
    });
    return decodeContent(plaintext).content;
  } finally {
    retired?.fill(0);
  }
}
