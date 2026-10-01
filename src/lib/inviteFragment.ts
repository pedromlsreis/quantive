/**
 * Takes the invite secret out of /join/<id>#k=<secret> before anything else
 * runs. Spec: docs/security/encryption.md §8.8.
 *
 * Imported first in main.tsx. Analytics attaches the page URL to every
 * event, so the fragment is read into memory and removed from the address
 * bar before analytics or the router start. A reload after that has no
 * secret, and the join page asks for the link again.
 */

import { base64UrlDecode } from './base64url';

const INVITE_PATH = /^\/join\/[^/]+\/?$/;
const SECRET_BYTES = 32;

let secret: Uint8Array | null = null;

export function captureInviteFragment(location: Location = window.location, history: History = window.history): void {
  if (!INVITE_PATH.test(location.pathname) || !location.hash) return;
  const match = /^#k=([A-Za-z0-9_-]+)$/.exec(location.hash);
  if (match) {
    try {
      const bytes = base64UrlDecode(match[1]);
      if (bytes.length === SECRET_BYTES) secret = bytes;
    } catch {
      // Malformed link: the join page says so.
    }
  }
  history.replaceState(history.state, '', location.pathname + location.search);
}

/** The secret from the link this tab was opened with, if any. */
export function peekInviteSecret(): Uint8Array | null {
  return secret;
}

/** Zeroes and drops the secret once the invite is used. */
export function clearInviteSecret(): void {
  secret?.fill(0);
  secret = null;
}

if (typeof window !== 'undefined') captureInviteFragment();
