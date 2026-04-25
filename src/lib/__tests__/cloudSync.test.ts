import { describe, it, expect, vi } from 'vitest';
import { isTransientError, upsertSnapshot } from '@/lib/cloudSync';
import type { PortfolioData } from '@/lib/types';

describe('isTransientError', () => {
  it('returns false for null/undefined', () => {
    expect(isTransientError(null)).toBe(false);
    expect(isTransientError(undefined)).toBe(false);
  });

  it('returns true for fetch network failures (TypeError)', () => {
    expect(isTransientError(new TypeError('Failed to fetch'))).toBe(true);
  });

  it('returns true for HTTP 500/502/503', () => {
    expect(isTransientError({ status: 500 })).toBe(true);
    expect(isTransientError({ status: 502 })).toBe(true);
    expect(isTransientError({ status: 503 })).toBe(true);
  });

  it('returns false for HTTP 4xx', () => {
    expect(isTransientError({ status: 400 })).toBe(false);
    expect(isTransientError({ status: 401 })).toBe(false);
    expect(isTransientError({ status: 403 })).toBe(false);
    expect(isTransientError({ status: 404 })).toBe(false);
    expect(isTransientError({ status: 429 })).toBe(false);
  });

  it('falls back to numeric `code` when `status` is missing', () => {
    expect(isTransientError({ code: '503' })).toBe(true);
    expect(isTransientError({ code: '404' })).toBe(false);
  });

  it('returns false for plain Error or non-HTTP objects', () => {
    expect(isTransientError(new Error('boom'))).toBe(false);
    expect(isTransientError({ message: 'boom' })).toBe(false);
    expect(isTransientError('string error')).toBe(false);
  });
});

describe('upsertSnapshot', () => {
  const samplePayload: PortfolioData = {
    facts: [],
    refSources: [],
  };

  function makeMockClient(upsertResult: { error: unknown }) {
    const upsert = vi.fn().mockResolvedValue(upsertResult);
    const from = vi.fn().mockReturnValue({ upsert });
    return { client: { from } as never, from, upsert };
  }

  it('calls upsert on portfolio_snapshots with the right payload + onConflict', async () => {
    const { client, from, upsert } = makeMockClient({ error: null });
    await upsertSnapshot(client, 'user-123', samplePayload);
    expect(from).toHaveBeenCalledWith('portfolio_snapshots');
    expect(upsert).toHaveBeenCalledWith(
      { user_id: 'user-123', data: samplePayload },
      { onConflict: 'user_id' },
    );
  });

  it('throws when supabase returns an error', async () => {
    const supabaseErr = { message: 'permission denied', status: 403 };
    const { client } = makeMockClient({ error: supabaseErr });
    await expect(upsertSnapshot(client, 'u', samplePayload)).rejects.toBe(supabaseErr);
  });

  it('resolves cleanly when supabase returns no error', async () => {
    const { client } = makeMockClient({ error: null });
    await expect(upsertSnapshot(client, 'u', samplePayload)).resolves.toBeUndefined();
  });
});
