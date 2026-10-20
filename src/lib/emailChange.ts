/**
 * Changing the sign-in email: a fresh password sign-in, then a link to the new
 * address that is confirmed while signed in to the same account. The request
 * waits in the user's app_metadata. Spec: docs/security/encryption.md §8.11.
 */
import type { SupabaseClient, User } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import { functionErrorCode } from '@/lib/functionError';

type Client = SupabaseClient<Database>;

// Mirrors PENDING_EMAIL_CHANGE_KEY in supabase/functions/_shared/emailChange.ts
// (edge functions can't import src/). Only the service role writes it.
export const PENDING_EMAIL_CHANGE_KEY = 'pending_email_change';

export interface PendingEmailChange {
  email: string;
  expiresAt: number;
}

/** The address an email change is waiting on, while its link still works. */
export function pendingEmailChange(user: Pick<User, 'app_metadata'>, now: number = Date.now()): PendingEmailChange | null {
  const raw = (user.app_metadata as Record<string, unknown> | undefined)?.[PENDING_EMAIL_CHANGE_KEY];
  if (!raw || typeof raw !== 'object') return null;
  const { email, expires_at: expires } = raw as { email?: unknown; expires_at?: unknown };
  if (typeof email !== 'string' || typeof expires !== 'string') return null;
  const expiresAt = Date.parse(expires);
  return expiresAt > now ? { email, expiresAt } : null;
}

/**
 * Emails a confirmation link to `email`. Call straight after a fresh password
 * sign-in (usePasswordCheck): the function refuses older sessions. Refreshes
 * the session so `user` carries the pending change. Returns an error code.
 */
export async function requestEmailChange(client: Client, email: string): Promise<string | null> {
  const { error } = await client.functions.invoke('request-email-change', { body: { email } });
  if (error) return (await functionErrorCode(error)) ?? 'request_failed';
  await client.auth.refreshSession();
  return null;
}

/** The new address, or the function's error code. */
export type ConfirmEmailChangeResult = { email: string } | { code: string };

/** Finishes the change with the link's token. Needs a session for the same account. */
export async function confirmEmailChange(client: Client, token: string): Promise<ConfirmEmailChangeResult> {
  const { data, error } = await client.functions.invoke('confirm-email-change', { body: { token } });
  if (error) return { code: (await functionErrorCode(error)) ?? 'confirm_failed' };
  await client.auth.refreshSession();
  return { email: typeof data?.email === 'string' ? data.email : '' };
}

export function requestErrorMessage(code: string): string {
  switch (code) {
    case 'invalid_email':
      return "That doesn't look like a valid email address.";
    case 'same_email':
      return "That's already your email.";
    case 'password_required':
      return 'Enter your password again to change your email.';
    case 'rate_limited':
      return 'A few too many attempts in a row. Wait a minute and try again.';
    case 'send_failed':
      return "We couldn't send the email. Try again in a few minutes.";
    case 'unauthenticated':
      return 'Your session expired. Sign in again, then try again.';
    default:
      return "Couldn't start the change. Try again.";
  }
}
