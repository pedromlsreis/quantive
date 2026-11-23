import type { SupabaseClient } from '@supabase/supabase-js';
import type { PortfolioData } from '@/lib/types';
import {
  ENC_VERSION,
  decryptSnapshot,
  encryptSnapshot,
} from '@/lib/crypto';
import { byteaToBytes, bytesToBytea } from '@/lib/keySession/bytea';

export type SyncOutcome = 'synced' | 'error';

/**
 * The personal snapshot as stored: the portfolio, plus the user's shares of
 * their extra portfolios (allPortfolios.ts). Shares live here because this
 * blob is never shared, so a partner can't see or change them.
 */
export type PersonalSnapshot = PortfolioData & { portfolioShares?: Record<string, number> };

/**
 * Treat fetch network failures and HTTP 5xx as transient (worth retrying).
 * Everything else (4xx, validation errors, undefined) is terminal.
 */
export function isTransientError(err: unknown): boolean {
  if (!err) return false;
  if (err instanceof TypeError) return true; // fetch network error
  const e = err as { status?: unknown; code?: unknown };
  const status = typeof e.status === 'number' ? e.status : Number(e.code);
  return Number.isFinite(status) && status >= 500;
}

/**
 * Encrypted upsert (v1 path). Serializes portfolioData to JSON bytes,
 * encrypts under the user's DK with a fresh nonce, and writes
 * (encrypted_data, nonce, enc_version=1, data=NULL) to the snapshot row.
 *
 * Spec: docs/security/encryption.md §9.1.
 */
export async function upsertEncryptedSnapshot(
  client: SupabaseClient,
  userId: string,
  portfolioData: PersonalSnapshot,
  dataKey: Uint8Array,
): Promise<void> {
  const plaintext = new TextEncoder().encode(JSON.stringify(portfolioData));
  const enc = await encryptSnapshot({ plaintext, dataKey, userId });

  const { error } = await client
    .from('portfolio_snapshots')
    .upsert(
      {
        user_id: userId,
        data: null,
        encrypted_data: bytesToBytea(enc.ciphertext) as unknown as never,
        nonce: bytesToBytea(enc.nonce) as unknown as never,
        enc_version: enc.encVersion,
      },
      { onConflict: 'user_id' },
    );
  if (error) throw error;
}

/**
 * The shape of a portfolio_snapshots row as it comes back from Supabase
 * for the load path. Only the fields we care about.
 */
export interface SnapshotRow {
  data: unknown | null;
  encrypted_data: string | null;   // PostgREST hex-bytea
  nonce: string | null;            // PostgREST hex-bytea (24 bytes)
  enc_version: number;
}

export type LoadedSnapshot = { kind: 'encrypted'; data: unknown };

/**
 * Load + decrypt-if-needed a single snapshot row. Pure decoding, no I/O —
 * the caller fetches the row.
 *
 * Throws if:
 *   - enc_version is unknown
 *   - row shape doesn't match enc_version (defense in depth on top of the DB CHECK)
 *   - decryption fails (wrong key / tampered ciphertext)
 */
export async function decodeSnapshot(
  row: SnapshotRow,
  args: { userId: string; dataKey: Uint8Array | null },
): Promise<LoadedSnapshot> {
  if (row.enc_version === ENC_VERSION) {
    if (!row.encrypted_data || !row.nonce) {
      throw new Error('row marked v1 but encrypted_data or nonce is null');
    }
    if (!args.dataKey) {
      throw new Error('snapshot is encrypted but no data key is loaded');
    }
    const ciphertext = byteaToBytes(row.encrypted_data);
    const nonce = byteaToBytes(row.nonce);
    const plaintextBytes = await decryptSnapshot({
      encrypted: { ciphertext, nonce, encVersion: row.enc_version },
      dataKey: args.dataKey,
      userId: args.userId,
    });
    const json = new TextDecoder().decode(plaintextBytes);
    return { kind: 'encrypted', data: JSON.parse(json) };
  }

  throw new Error(
    `unsupported snapshot enc_version: ${row.enc_version} (this build supports ${ENC_VERSION})`,
  );
}

export interface AttemptCloudSyncDeps {
  /** The actual upsert. Tests substitute a mock; production passes upsertEncryptedSnapshot bound to the supabase client. */
  upsert: (payload: PortfolioData) => Promise<void>;
  /** Returns true while this attempt is still the latest. Only the latest touches status. */
  isLatest: () => boolean;
  /**
   * Returns false once a newer save has replaced this one. Until then an
   * attempt that is merely stale (the user switched view) still retries and
   * returns its outcome, so a failure is reported. Defaults to isLatest.
   */
  isCurrent?: () => boolean;
  /** Sleep for retry backoff. Tests inject a fake to advance vitest fake timers. */
  delay: (ms: number) => Promise<void>;
  /** Status sink. Only invoked while isLatest() is true. */
  onStatus: (status: 'syncing' | 'synced' | 'error') => void;
  /** Optional error categorisation hook. Fires alongside onStatus('error'). */
  onError?: (reason: 'transient' | 'terminal') => void;
}

/**
 * Orchestrates a single cloud-sync attempt with one transient retry.
 *
 *  - Calls upsert; on success -> 'synced'.
 *  - On transient error -> wait, retry once. If retry succeeds -> 'synced'.
 *  - On terminal error or exhausted retry -> 'error'.
 *  - Only the latest attempt (isLatest()) touches status.
 *  - A replaced attempt (isCurrent() === false) bails: no retry, no outcome.
 *
 * Returns the final outcome for the caller, or null if replaced.
 */
export async function attemptCloudSync(
  payload: PortfolioData,
  deps: AttemptCloudSyncDeps,
): Promise<SyncOutcome | null> {
  const { upsert, isLatest, delay, onStatus, onError } = deps;
  const isCurrent = deps.isCurrent ?? isLatest;
  // A caller may queue an attempt that is stale before it starts; it still writes.
  if (isLatest()) onStatus('syncing');

  try {
    await upsert(payload);
    if (!isCurrent()) return null;
    if (isLatest()) onStatus('synced');
    return 'synced';
  } catch (err) {
    if (!isCurrent()) return null;
    const transient = isTransientError(err);
    if (transient) {
      try {
        await delay(2000);
        if (!isCurrent()) return null;
        await upsert(payload);
        if (!isCurrent()) return null;
        if (isLatest()) onStatus('synced');
        return 'synced';
      } catch {
        if (!isCurrent()) return null;
      }
    }
    onError?.(transient ? 'transient' : 'terminal');
    if (isLatest()) onStatus('error');
    return 'error';
  }
}
