import { describe, it, expect } from 'vitest';
import { hasRecentEmailLinkAuth } from '../emailLinkAuth';

const NOW = 1_790_000_000;

function token(payload: unknown): string {
  const b64url = (s: string) => Buffer.from(s).toString('base64url');
  return `${b64url('{"alg":"HS256"}')}.${b64url(JSON.stringify(payload))}.signature`;
}

describe('hasRecentEmailLinkAuth', () => {
  it('accepts a session opened from an email link within the hour', () => {
    // Shape observed on a real recovery session: GoTrue records it as "otp".
    expect(hasRecentEmailLinkAuth(token({ amr: [{ method: 'otp', timestamp: NOW - 120 }] }), NOW)).toBe(true);
    expect(hasRecentEmailLinkAuth(token({ amr: [{ method: 'recovery', timestamp: NOW }] }), NOW)).toBe(true);
    expect(hasRecentEmailLinkAuth(token({ amr: [{ method: 'magiclink', timestamp: NOW }] }), NOW)).toBe(true);
  });

  it('rejects a password session', () => {
    expect(hasRecentEmailLinkAuth(token({ amr: [{ method: 'password', timestamp: NOW }] }), NOW)).toBe(false);
  });

  it('rejects an email-link session older than the window', () => {
    expect(hasRecentEmailLinkAuth(token({ amr: [{ method: 'otp', timestamp: NOW - 3601 }] }), NOW)).toBe(false);
    expect(hasRecentEmailLinkAuth(token({ amr: [{ method: 'otp', timestamp: NOW - 600 }] }), NOW, 300)).toBe(false);
  });

  it('rejects a timestamp far in the future', () => {
    expect(hasRecentEmailLinkAuth(token({ amr: [{ method: 'otp', timestamp: NOW + 3600 }] }), NOW)).toBe(false);
  });

  it('accepts when any amr entry qualifies', () => {
    const t = token({ amr: [{ method: 'password', timestamp: NOW - 10 }, { method: 'otp', timestamp: NOW - 10 }] });
    expect(hasRecentEmailLinkAuth(t, NOW)).toBe(true);
  });

  it('rejects malformed tokens and payloads', () => {
    expect(hasRecentEmailLinkAuth('not-a-jwt', NOW)).toBe(false);
    expect(hasRecentEmailLinkAuth('a.%%%.c', NOW)).toBe(false);
    expect(hasRecentEmailLinkAuth(token({}), NOW)).toBe(false);
    expect(hasRecentEmailLinkAuth(token({ amr: ['otp'] }), NOW)).toBe(false);
    expect(hasRecentEmailLinkAuth(token({ amr: [{ method: 'otp', timestamp: String(NOW) }] }), NOW)).toBe(false);
  });
});
