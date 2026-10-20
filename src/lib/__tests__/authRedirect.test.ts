import { describe, expect, it, vi } from 'vitest';
import { captureAuthRedirect, parseAuthRedirect, takeAuthRedirectNotice } from '../authRedirect';

function fakeLocation(url: string) {
  const u = new URL(url);
  return { pathname: u.pathname, search: u.search, hash: u.hash } as Location;
}

function fakeHistory() {
  return { state: { key: 'k' }, replaceState: vi.fn() } as unknown as History & { replaceState: ReturnType<typeof vi.fn> };
}

// As Supabase's /verify redirect writes it for the implicit flow.
const EXPIRED = '#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired';

describe('parseAuthRedirect', () => {
  it('reads a failed link, and whether it expired', () => {
    expect(parseAuthRedirect(EXPIRED)).toEqual({ kind: 'link-error', expired: true });
    expect(parseAuthRedirect('#error=server_error&error_code=unexpected_failure&error_description=Error+confirming+user')).toEqual({
      kind: 'link-error',
      expired: false,
    });
  });

  it('ignores session fragments, plain anchors and other app fragments', () => {
    expect(parseAuthRedirect('#access_token=at&refresh_token=rt&type=signup')).toBeNull();
    expect(parseAuthRedirect('#recovery')).toBeNull();
    expect(parseAuthRedirect('#error')).toBeNull();
    expect(parseAuthRedirect('#t=abc')).toBeNull();
    expect(parseAuthRedirect('#k=abc')).toBeNull();
    expect(parseAuthRedirect('')).toBeNull();
  });
});

describe('captureAuthRedirect', () => {
  it('takes a failed link out of the address bar and hands its notice out once', () => {
    const history = fakeHistory();
    captureAuthRedirect(fakeLocation(`https://usequantive.app/?x=1${EXPIRED}`), history);
    expect(history.replaceState).toHaveBeenCalledWith({ key: 'k' }, '', '/?x=1');
    expect(takeAuthRedirectNotice()).toEqual({ kind: 'link-error', expired: true });
    expect(takeAuthRedirectNotice()).toBeNull();
  });

  it('leaves a session fragment for the Supabase client to consume', () => {
    const history = fakeHistory();
    captureAuthRedirect(fakeLocation('https://usequantive.app/#access_token=at&refresh_token=rt&type=signup'), history);
    expect(takeAuthRedirectNotice()).toBeNull();
    expect(history.replaceState).not.toHaveBeenCalled();
  });

  it('leaves /reset-password to report its own link errors', () => {
    const history = fakeHistory();
    captureAuthRedirect(fakeLocation(`https://usequantive.app/reset-password${EXPIRED}`), history);
    expect(takeAuthRedirectNotice()).toBeNull();
    expect(history.replaceState).not.toHaveBeenCalled();
  });
});
