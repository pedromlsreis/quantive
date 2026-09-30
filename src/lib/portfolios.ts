/**
 * Extra portfolios (Family plan): list, open, create, save, delete.
 * Spec: docs/security/encryption.md §15.1. The personal portfolio keeps its
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
import { byteaToBytes, bytesToBytea } from '@/lib/keySession/bytea';
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

const EMPTY_CONTENT = { facts: [], refSources: [], goals: [] };

function encodeContent(name: string, data: PortfolioData | null): Uint8Array {
  return new TextEncoder().encode(JSON.stringify({ ...(data ?? EMPTY_CONTENT), name }));
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
  created_at: string;
}

interface MemberRow {
  wrapped_pk: string;
  key_epoch: number;
  portfolios: PortfolioRow | null;
}

const MEMBER_SELECT =
  'wrapped_pk, key_epoch, portfolios(id, owner_id, encrypted_data, nonce, enc_version, revision, key_epoch, created_at)';

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
    meta: { id: row.id, name, ownerId: row.owner_id, revision: row.revision, keyEpoch: row.key_epoch },
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
    meta: { id, name, ownerId: userId, revision: 1, keyEpoch: 1 },
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
 * Runs saves one at a time. A save requested while one is running replaces
 * any save already waiting, so the newest payload goes next. Each payload
 * is the whole blob, and each compare-and-swap needs the revision the
 * previous save returned, so running two at once would conflict with itself.
 */
export function createSerialSaver<T>(run: (payload: T) => Promise<void>): (payload: T) => Promise<void> {
  let running: Promise<void> | null = null;
  let waiting: { payload: T } | null = null;
  return (payload: T) => {
    if (running) {
      waiting = { payload };
      return running;
    }
    running = (async () => {
      let current: { payload: T } | null = { payload };
      try {
        while (current) {
          try {
            await run(current.payload);
          } catch (e) {
            console.error('[portfolios] save failed:', e);
          }
          current = waiting;
          waiting = null;
        }
      } finally {
        running = null;
      }
    })();
    return running;
  };
}
