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
 * Plaintext upsert (legacy v0 path). Used only by 'unlocked-legacy' sessions
 * — encrypted users go through `upsertEncryptedSnapshot` instead.
 *
 * Throws on supabase error so callers have one error path to handle.
 */
export async function upsertSnapshot(
  client: SupabaseClient,
  userId: string,
  portfolioData: PortfolioData,
): Promise<void> {
  const { error } = await client
    .from('portfolio_snapshots')
    .upsert(
      { user_id: userId, data: portfolioData as never },
      { onConflict: 'user_id' },
    );
  if (error) throw error;
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
  portfolioData: PortfolioData,
  dataKey: Uint8Array,
): Promise<void> {
  const plaintext = new TextEncoder().encode(JSON.stringify(portfolioData));
  const enc = await encryptSnapshot({ plaintext, dataKey, userId });

  const { error } = await client
    .from('portfolio_snapshots')
    .upsert(
      {
        user_id: userId,
        // Explicitly NULL data so the CHECK invariant holds even if the
        // row was previously v0 plaintext (e.g., during Phase 5 lazy
        // migration).
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
  data: unknown | null;            // legacy plaintext (any JSON shape)
  encrypted_data: string | null;   // PostgREST hex-bytea
  nonce: string | null;            // PostgREST hex-bytea (24 bytes)
  enc_version: number;             // 0 or 1
}

/**
 * Result of a successful load. `kind: 'plaintext'` returns the raw JSON-
 * parsed object (legacy v0 row). `kind: 'encrypted'` returns the decrypted
 * JSON-parsed object. The shape of `data` is not validated here — that's
 * the caller's job (date parsing, etc.).
 */
export type LoadedSnapshot =
  | { kind: 'plaintext'; data: unknown }
  | { kind: 'encrypted'; data: unknown };

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
  if (row.enc_version === 0) {
    if (row.data === null || row.data === undefined) {
      throw new Error('row marked v0 but data is null');
    }
    return { kind: 'plaintext', data: row.data };
  }

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
    `unsupported snapshot enc_version: ${row.enc_version} (this build supports 0 and ${ENC_VERSION})`,
  );
}

export interface AttemptCloudSyncDeps {
  /** The actual upsert. Tests substitute a mock; production passes upsertSnapshot bound to the supabase client. */
  upsert: (payload: PortfolioData) => Promise<void>;
  /** Returns true while this attempt is still the latest. Stale attempts must no-op. */
  isLatest: () => boolean;
  /** Sleep for retry backoff. Tests inject a fake to advance vitest fake timers. */
  delay: (ms: number) => Promise<void>;
  /** Status sink. Only invoked while isLatest() is true. */
  onStatus: (status: 'syncing' | 'synced' | 'error') => void;
}

/**
 * Orchestrates a single cloud-sync attempt with one transient retry.
 *
 *  - Calls upsert; on success -> 'synced'.
 *  - On transient error -> wait, retry once. If retry succeeds -> 'synced'.
 *  - On terminal error or exhausted retry -> 'error'.
 *  - Stale attempts (isLatest() === false) bail without touching status.
 *
 * Returns the final outcome for the caller, or null if superseded.
 */
export async function attemptCloudSync(
  payload: PortfolioData,
  deps: AttemptCloudSyncDeps,
): Promise<SyncOutcome | null> {
  const { upsert, isLatest, delay, onStatus } = deps;
  onStatus('syncing');

  try {
    await upsert(payload);
    if (!isLatest()) return null;
    onStatus('synced');
    return 'synced';
  } catch (err) {
    if (!isLatest()) return null;
    if (isTransientError(err)) {
      try {
        await delay(2000);
        if (!isLatest()) return null;
        await upsert(payload);
        if (!isLatest()) return null;
        onStatus('synced');
        return 'synced';
      } catch {
        if (!isLatest()) return null;
      }
    }
    onStatus('error');
    return 'error';
  }
}
