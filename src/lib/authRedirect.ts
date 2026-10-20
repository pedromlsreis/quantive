/**
 * Reads a failed emailed auth link from the URL fragment, before the Supabase
 * client starts. Imported in main.tsx ahead of the app.
 *
 * With the implicit flow, Supabase lands a link that didn't work (usually
 * expired or already used, most often a sign-up confirmation) on its redirect
 * URL with `#error=…&error_code=…&error_description=…`. The SDK leaves that in
 * the URL and says nothing, so it is noted here and removed from the address
 * bar; it carries no tokens.
 */

export type AuthRedirectNotice = { kind: 'link-error'; expired: boolean };

let notice: AuthRedirectNotice | null = null;

export function parseAuthRedirect(hash: string): AuthRedirectNotice | null {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  if (params.get('access_token')) return null;
  if (params.get('error_code') || params.get('error_description')) {
    return { kind: 'link-error', expired: params.get('error_code') === 'otp_expired' };
  }
  return null;
}

export function captureAuthRedirect(location: Location = window.location, history: History = window.history): void {
  // ResetPassword reports a failed recovery link itself.
  if (location.pathname === '/reset-password') return;
  notice = parseAuthRedirect(location.hash);
  if (notice) history.replaceState(history.state, '', location.pathname + location.search);
}

/** The notice from the link this tab was opened with; returns it once. */
export function takeAuthRedirectNotice(): AuthRedirectNotice | null {
  const taken = notice;
  notice = null;
  return taken;
}

if (typeof window !== 'undefined') captureAuthRedirect();
