import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import { attemptCloudSync, type AttemptCloudSyncDeps } from '@/lib/cloudSync';
import type { PortfolioData } from '@/lib/types';

const payload: PortfolioData = { facts: [], refSources: [] };

function makeDeps(overrides: Partial<AttemptCloudSyncDeps> = {}): {
  deps: AttemptCloudSyncDeps;
  statuses: string[];
  upsert: ReturnType<typeof vi.fn>;
  delay: ReturnType<typeof vi.fn>;
} {
  const statuses: string[] = [];
  const upsert = vi.fn(async () => undefined);
  const delay = vi.fn(async () => undefined);
  const deps: AttemptCloudSyncDeps = {
    upsert,
    delay,
    isLatest: () => true,
    onStatus: (s) => statuses.push(s),
    ...overrides,
  };
  return { deps, statuses, upsert, delay };
}

describe('attemptCloudSync', () => {
  describe('happy path', () => {
    it('emits syncing -> synced and returns synced', async () => {
      const { deps, statuses, upsert } = makeDeps();
      const outcome = await attemptCloudSync(payload, deps);
      expect(outcome).toBe('synced');
      expect(statuses).toEqual(['syncing', 'synced']);
      expect(upsert).toHaveBeenCalledTimes(1);
      expect(upsert).toHaveBeenCalledWith(payload);
    });
  });

  describe('transient errors retry once', () => {
    it('retries after delay and succeeds -> synced', async () => {
      const upsert = vi.fn()
        .mockRejectedValueOnce(new TypeError('Failed to fetch'))
        .mockResolvedValueOnce(undefined);
      const { deps, statuses, delay } = makeDeps({ upsert });
      const outcome = await attemptCloudSync(payload, deps);
      expect(outcome).toBe('synced');
      expect(statuses).toEqual(['syncing', 'synced']);
      expect(upsert).toHaveBeenCalledTimes(2);
      expect(delay).toHaveBeenCalledWith(2000);
    });

    it('retries on 5xx and succeeds -> synced', async () => {
      const upsert = vi.fn()
        .mockRejectedValueOnce({ status: 503 })
        .mockResolvedValueOnce(undefined);
      const { deps, statuses } = makeDeps({ upsert });
      const outcome = await attemptCloudSync(payload, deps);
      expect(outcome).toBe('synced');
      expect(statuses).toEqual(['syncing', 'synced']);
      expect(upsert).toHaveBeenCalledTimes(2);
    });

    it('reports error if both attempts fail transiently', async () => {
      const upsert = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
      const { deps, statuses } = makeDeps({ upsert });
      const outcome = await attemptCloudSync(payload, deps);
      expect(outcome).toBe('error');
      expect(statuses).toEqual(['syncing', 'error']);
      expect(upsert).toHaveBeenCalledTimes(2);
    });
  });

  describe('terminal errors fail fast', () => {
    it('does NOT retry on 4xx', async () => {
      const upsert = vi.fn().mockRejectedValue({ status: 403 });
      const { deps, statuses, delay } = makeDeps({ upsert });
      const outcome = await attemptCloudSync(payload, deps);
      expect(outcome).toBe('error');
      expect(statuses).toEqual(['syncing', 'error']);
      expect(upsert).toHaveBeenCalledTimes(1);
      expect(delay).not.toHaveBeenCalled();
    });

    it('does NOT retry on plain Error', async () => {
      const upsert = vi.fn().mockRejectedValue(new Error('schema mismatch'));
      const { deps, statuses, delay } = makeDeps({ upsert });
      const outcome = await attemptCloudSync(payload, deps);
      expect(outcome).toBe('error');
      expect(upsert).toHaveBeenCalledTimes(1);
      expect(delay).not.toHaveBeenCalled();
    });
  });

  describe('concurrency guard (isLatest)', () => {
    it('returns null and skips status update if superseded after first upsert', async () => {
      // After upsert resolves, simulate a newer call arriving.
      let calls = 0;
      const upsert = vi.fn(async () => { calls++; });
      const { deps, statuses } = makeDeps({
        upsert,
        isLatest: () => calls < 1,
      });
      const outcome = await attemptCloudSync(payload, deps);
      expect(outcome).toBeNull();
      // Only the initial 'syncing' should have been emitted.
      expect(statuses).toEqual(['syncing']);
    });

    it('returns null and skips status update if superseded after transient error', async () => {
      let attempts = 0;
      const upsert = vi.fn(async () => {
        attempts++;
        throw new TypeError('Failed to fetch');
      });
      const { deps, statuses, delay } = makeDeps({
        upsert,
        // Latest only during initial attempt; superseded before retry would run.
        isLatest: () => attempts < 1,
      });
      const outcome = await attemptCloudSync(payload, deps);
      expect(outcome).toBeNull();
      expect(statuses).toEqual(['syncing']);
      expect(delay).not.toHaveBeenCalled();
    });

    it('does not emit error when superseded mid-retry', async () => {
      let attempts = 0;
      const upsert = vi.fn(async () => {
        attempts++;
        throw new TypeError('Failed to fetch');
      });
      const { deps, statuses } = makeDeps({
        upsert,
        // Allow first attempt + retry attempt, then become stale.
        isLatest: () => attempts < 2,
      });
      const outcome = await attemptCloudSync(payload, deps);
      expect(outcome).toBeNull();
      // Both attempts ran but the trailing 'error' status was suppressed.
      expect(statuses).toEqual(['syncing']);
    });
  });
});

describe('saveToCloud retry semantics (integration with retrySync)', () => {
  // Simulates the higher-level retry loop the React component implements:
  // - lastAttemptRef holds the most recent payload
  // - retrySync replays it through attemptCloudSync
  let upsert: Mock<AttemptCloudSyncDeps['upsert']>;
  let lastAttempt: PortfolioData | null;

  beforeEach(() => {
    upsert = vi.fn<AttemptCloudSyncDeps['upsert']>();
    lastAttempt = null;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('manual retry replays the last attempted payload', async () => {
    upsert.mockRejectedValueOnce({ status: 403 });
    const payloadA: PortfolioData = { facts: [{ date: new Date(0), idSource: 'A', sourceVl: 1, currency: 'EUR' }], refSources: [] };
    const { deps } = makeDeps({ upsert });

    // Initial attempt — fails terminally.
    lastAttempt = payloadA;
    const first = await attemptCloudSync(payloadA, deps);
    expect(first).toBe('error');

    // User clicks Retry: replay lastAttempt.
    upsert.mockResolvedValueOnce(undefined);
    const retried = await attemptCloudSync(lastAttempt!, deps);
    expect(retried).toBe('synced');
    expect(upsert).toHaveBeenLastCalledWith(payloadA);
  });
});
