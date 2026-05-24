import { describe, it, expect, vi } from 'vitest';
import { checkRateLimit, extractIp } from '../rateLimit';

function fakeClient(behaviour: { data?: unknown; error?: { message: string }; throws?: boolean }) {
  const rpc = vi.fn(async () => {
    if (behaviour.throws) throw new Error('boom');
    return { data: behaviour.data ?? null, error: behaviour.error ?? null };
  });
  return { rpc };
}

describe('checkRateLimit', () => {
  it('allows when the RPC returns true', async () => {
    const client = fakeClient({ data: true });
    expect(await checkRateLimit(client, { ip: '1.2.3.4', bucket: 'b' })).toEqual({ allowed: true });
  });

  it('rejects when the RPC returns false, with the configured retryAfter', async () => {
    const client = fakeClient({ data: false });
    expect(await checkRateLimit(client, { ip: '1.2.3.4', bucket: 'b', windowSeconds: 30 })).toEqual({
      allowed: false,
      retryAfter: 30,
    });
  });

  it('defaults retryAfter to 60 when windowSeconds is not provided', async () => {
    const client = fakeClient({ data: false });
    const result = await checkRateLimit(client, { ip: '1.2.3.4', bucket: 'b' });
    expect(result).toEqual({ allowed: false, retryAfter: 60 });
  });

  it('fails open when the RPC returns an error', async () => {
    const client = fakeClient({ error: { message: 'connection refused' } });
    expect(await checkRateLimit(client, { ip: '1.2.3.4', bucket: 'b' })).toEqual({ allowed: true });
  });

  it('fails open when the RPC throws', async () => {
    const client = fakeClient({ throws: true });
    expect(await checkRateLimit(client, { ip: '1.2.3.4', bucket: 'b' })).toEqual({ allowed: true });
  });

  it('forwards bucket, maxRequests and windowSeconds as named RPC args', async () => {
    const client = fakeClient({ data: true });
    await checkRateLimit(client, { ip: '1.2.3.4', bucket: 'feedback', maxRequests: 7, windowSeconds: 45 });
    expect(client.rpc).toHaveBeenCalledWith('check_rate_limit_bucket', {
      p_ip: '1.2.3.4',
      p_bucket: 'feedback',
      p_max_requests: 7,
      p_window_seconds: 45,
    });
  });

  it('omits override args when not specified, so DB defaults apply', async () => {
    const client = fakeClient({ data: true });
    await checkRateLimit(client, { ip: '1.2.3.4', bucket: 'b' });
    expect(client.rpc).toHaveBeenCalledWith('check_rate_limit_bucket', { p_ip: '1.2.3.4', p_bucket: 'b' });
  });
});

describe('extractIp', () => {
  it('prefers CF-Connecting-IP when present', () => {
    const req = new Request('http://x', { headers: { 'CF-Connecting-IP': '9.9.9.9', 'X-Forwarded-For': '1.1.1.1' } });
    expect(extractIp(req)).toBe('9.9.9.9');
  });

  it('falls back to the first X-Forwarded-For entry', () => {
    const req = new Request('http://x', { headers: { 'X-Forwarded-For': '1.1.1.1, 2.2.2.2' } });
    expect(extractIp(req)).toBe('1.1.1.1');
  });

  it('returns "unknown" when no IP headers are set', () => {
    const req = new Request('http://x');
    expect(extractIp(req)).toBe('unknown');
  });

  it('trims whitespace from the X-Forwarded-For entry', () => {
    const req = new Request('http://x', { headers: { 'X-Forwarded-For': '  10.0.0.1  , 1.1.1.1' } });
    expect(extractIp(req)).toBe('10.0.0.1');
  });
});
