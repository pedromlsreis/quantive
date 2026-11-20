import { describe, it, expect } from 'vitest';
import { fetchLastSeen } from '../lastSeen';

const client = (data: unknown, error: { message: string } | null = null) => ({
  rpc: async () => ({ data, error }),
});

describe('fetchLastSeen', () => {
  it('normalises Postgres timestamps to toISOString format, so they compare as strings', async () => {
    const seen = await fetchLastSeen(client({
      a: '2026-11-17T18:30:00.123456+00:00',
      b: '2026-11-18T07:30:00+13:00',
    }));
    expect(seen.get('a')).toBe('2026-11-17T18:30:00.123Z');
    expect(seen.get('b')).toBe('2026-11-17T18:30:00.000Z');
    expect(seen.get('a')! >= new Date('2026-11-17T18:00:00Z').toISOString()).toBe(true);
  });

  it('skips entries that are not timestamps', async () => {
    const seen = await fetchLastSeen(client({ a: null, b: 'soon', c: 42 }));
    expect(seen.size).toBe(0);
  });

  it('throws on an RPC error or a response that is not an object', async () => {
    await expect(fetchLastSeen(client(null, { message: 'permission denied' }))).rejects.toThrow(/permission denied/);
    await expect(fetchLastSeen(client(null))).rejects.toThrow(/unexpected shape/);
    await expect(fetchLastSeen(client([]))).rejects.toThrow(/unexpected shape/);
  });
});
