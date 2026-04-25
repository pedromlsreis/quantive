import type { SupabaseClient } from '@supabase/supabase-js';
import type { PortfolioData } from '@/lib/types';

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
 * Single upsert to portfolio_snapshots. Throws on supabase error so callers
 * have one error path to handle.
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
