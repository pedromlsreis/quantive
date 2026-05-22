import { describe, it, expect } from 'vitest';
import { decideIdempotencyOutcome } from '../idempotency';

describe('decideIdempotencyOutcome', () => {
  it('returns process when the insert returned the inserted row', () => {
    const result = decideIdempotencyOutcome({
      data: [{ event_id: 'evt_123' }],
      error: null,
    });
    expect(result).toEqual({ kind: 'process' });
  });

  it('returns duplicate on Postgres unique_violation (code 23505)', () => {
    // This is the canonical replay case: Stripe retried after a transient
    // 5xx, but our handler already committed the previous delivery.
    const result = decideIdempotencyOutcome({
      data: null,
      error: { code: '23505', message: 'duplicate key value violates unique constraint' },
    });
    expect(result).toEqual({ kind: 'duplicate', reason: 'unique_violation' });
  });

  it('returns duplicate when insert succeeded but returned no rows', () => {
    // PostgREST sometimes surfaces ON CONFLICT DO NOTHING this way. Treating
    // empty as success would silently re-run the handler on every replay.
    const result = decideIdempotencyOutcome({ data: [], error: null });
    expect(result).toEqual({ kind: 'duplicate', reason: 'no_rows' });
  });

  it('returns duplicate when data is null and there is no error', () => {
    const result = decideIdempotencyOutcome({ data: null, error: null });
    expect(result).toEqual({ kind: 'duplicate', reason: 'no_rows' });
  });

  it('returns error on a non-conflict Postgres failure', () => {
    // Anything that is not 23505 is a real failure — the caller must 500
    // so Stripe retries with backoff rather than silently dropping the event.
    const result = decideIdempotencyOutcome({
      data: null,
      error: { code: '08006', message: 'connection failure' },
    });
    expect(result).toEqual({
      kind: 'error',
      code: '08006',
      message: 'connection failure',
    });
  });

  it('returns error when the error has no code (network/timeout)', () => {
    const result = decideIdempotencyOutcome({
      data: null,
      error: { message: 'fetch failed' },
    });
    expect(result).toEqual({
      kind: 'error',
      code: undefined,
      message: 'fetch failed',
    });
  });

  it('falls back to "unknown" when the error has neither code nor message', () => {
    const result = decideIdempotencyOutcome({
      data: null,
      // supabase-js has been seen to surface bare {} on certain RPC failures.
      error: {} as { code?: string; message?: string },
    });
    expect(result).toEqual({
      kind: 'error',
      code: undefined,
      message: 'unknown',
    });
  });

  it('treats an error as authoritative even when data is also present', () => {
    // Defensive: if both branches are populated, the error wins. We must
    // never silently process when supabase-js signalled trouble.
    const result = decideIdempotencyOutcome({
      data: [{ event_id: 'evt_999' }],
      error: { code: '23505', message: 'duplicate' },
    });
    expect(result.kind).toBe('duplicate');
  });
});
