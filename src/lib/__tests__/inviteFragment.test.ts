import { describe, expect, it, vi } from 'vitest';
import { base64UrlDecode, base64UrlEncode } from '../base64url';
import { captureInviteFragment, clearInviteSecret, peekInviteSecret } from '../inviteFragment';

function fakeLocation(url: string) {
  const u = new URL(url);
  return { pathname: u.pathname, search: u.search, hash: u.hash } as Location;
}

function fakeHistory() {
  return { state: { key: 'k' }, replaceState: vi.fn() } as unknown as History & { replaceState: ReturnType<typeof vi.fn> };
}

const SECRET = new Uint8Array(32).map((_, i) => i * 7);
const encoded = base64UrlEncode(SECRET);

describe('captureInviteFragment', () => {
  it('keeps the secret in memory and removes the fragment from the address bar', () => {
    const history = fakeHistory();
    captureInviteFragment(fakeLocation(`https://usequantive.app/join/abc?x=1#k=${encoded}`), history);
    expect(Array.from(peekInviteSecret()!)).toEqual(Array.from(SECRET));
    expect(history.replaceState).toHaveBeenCalledWith({ key: 'k' }, '', '/join/abc?x=1');

    clearInviteSecret();
    expect(peekInviteSecret()).toBeNull();
  });

  it('zeroes the secret when cleared', () => {
    captureInviteFragment(fakeLocation(`https://usequantive.app/join/abc#k=${encoded}`), fakeHistory());
    const held = peekInviteSecret()!;
    clearInviteSecret();
    expect(held.every((b) => b === 0)).toBe(true);
  });

  it('strips a malformed fragment without keeping anything', () => {
    const history = fakeHistory();
    captureInviteFragment(fakeLocation('https://usequantive.app/join/abc#k=short'), history);
    expect(peekInviteSecret()).toBeNull();
    expect(history.replaceState).toHaveBeenCalledWith({ key: 'k' }, '', '/join/abc');
  });

  it('leaves other routes alone, including auth callbacks in the hash', () => {
    const history = fakeHistory();
    captureInviteFragment(fakeLocation('https://usequantive.app/reset-password#access_token=t&type=recovery'), history);
    captureInviteFragment(fakeLocation('https://usequantive.app/#faq'), history);
    captureInviteFragment(fakeLocation(`https://usequantive.app/joinx/abc#k=${encoded}`), history);
    expect(history.replaceState).not.toHaveBeenCalled();
    expect(peekInviteSecret()).toBeNull();
  });
});

describe('base64url', () => {
  it('round-trips without padding', () => {
    for (const n of [0, 1, 2, 3, 31, 32, 33]) {
      const bytes = new Uint8Array(n).map((_, i) => (i * 37 + 11) % 256);
      const text = base64UrlEncode(bytes);
      expect(text).not.toMatch(/[+/=]/);
      expect(Array.from(base64UrlDecode(text))).toEqual(Array.from(bytes));
    }
  });

  it('rejects characters outside the alphabet', () => {
    expect(() => base64UrlDecode('abc+')).toThrow();
    expect(() => base64UrlDecode('ab=c')).toThrow();
  });
});
