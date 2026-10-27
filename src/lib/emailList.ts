/**
 * The "Keep me posted" links, client side: /email-updates confirms or
 * unsubscribes through the `email-list` edge function. Kept apart from
 * emailSignup.ts so the landing page's chunk doesn't carry this page's code.
 *
 * Sending an update: only to rows with confirmed_at set, and each email carries
 * https://usequantive.app/email-updates#unsubscribe=<that row's unsubscribe_token>.
 * email-list records every confirmation and unsubscribe in email_consent_events.
 */
import { supabase } from '@/integrations/supabase/client';
import { functionErrorCode } from '@/lib/functionError';

export type EmailListAction = 'confirm' | 'unsubscribe';

/** The error codes email-list answers with; each has its own copy on /email-updates. */
export const EMAIL_LIST_ERRORS = ['invalid_link', 'expired', 'rate_limited'] as const;
export type EmailListResult = 'ok' | 'failed' | (typeof EMAIL_LIST_ERRORS)[number];

// Mirror the token shapes in supabase/functions/_shared/emailList.ts.
const CONFIRM_FRAGMENT = /^#confirm=([A-Za-z0-9_-]{43})$/;
const UNSUBSCRIBE_FRAGMENT = /^#unsubscribe=([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/;

/** The action and token from /email-updates#confirm=… or #unsubscribe=…, or null for anything else. */
export function parseEmailListFragment(hash: string): { action: EmailListAction; token: string } | null {
  const confirm = CONFIRM_FRAGMENT.exec(hash);
  if (confirm) return { action: 'confirm', token: confirm[1] };
  const unsubscribe = UNSUBSCRIBE_FRAGMENT.exec(hash);
  return unsubscribe ? { action: 'unsubscribe', token: unsubscribe[1] } : null;
}

export async function submitEmailListAction(action: EmailListAction, token: string): Promise<EmailListResult> {
  const { error } = await supabase.functions.invoke('email-list', { body: { action, token } });
  if (!error) return 'ok';
  const code = await functionErrorCode(error);
  return EMAIL_LIST_ERRORS.find((known) => known === code) ?? 'failed';
}
