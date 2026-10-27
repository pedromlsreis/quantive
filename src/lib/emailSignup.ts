/**
 * Email capture — the client side of the wiring.
 *
 * Submits to the `email-signup` Supabase Edge Function, which verifies the
 * Cloudflare Turnstile token, rate-limits per IP, stores the address as a
 * request and emails a confirmation link (double opt-in). The link opens
 * /email-updates (lib/emailList.ts), which confirms through `email-list`.
 *
 * Deploy, in this order (the frontend auto-deploys when main moves):
 *   1. Secrets on the functions: TURNSTILE_SECRET_KEY (the same secret as
 *      Auth's Turnstile; without it email-signup refuses to send, since it
 *      emails any address it is given), RESEND_API_KEY (shared with the other
 *      mail-sending functions) and EMAIL_CONSENT_HMAC_KEY (keys the consent
 *      record; keep it for as long as consent records exist). Local development
 *      without Turnstile sets ALLOW_UNVERIFIED_EMAIL_SIGNUP=1 instead.
 *   2. Apply migrations 20260619120000_email_signups.sql and
 *      20261025120000_email_signups_double_opt_in.sql.
 *   3. `supabase functions deploy email-list`.
 *   4. Merge, and wait for the deploy workflow to publish /email-updates.
 *   5. `supabase functions deploy email-signup`. Until then the old function
 *      answers without `confirmation`, so the form shows an error rather than
 *      "check your inbox"; deploying it before step 4 would email links to a
 *      page that doesn't exist yet.
 */
import { supabase } from '@/integrations/supabase/client';

/**
 * Gates rendering of the email-capture block on the landing page. The form
 * calls the deployed Edge Function above, so keep this in step with whether
 * that function is live.
 */
export const EMAIL_CAPTURE_ENABLED = true;

/** Thrown when the signup request fails (network, captcha, server error, or an out-of-date function). */
export class EmailSignupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EmailSignupError';
  }
}

/**
 * Submit one email to the capture list. `turnstileToken` is the Cloudflare
 * Turnstile token, or null when the widget is disabled (no site key). Resolves
 * once a confirmation was requested, throws EmailSignupError on any failure.
 */
export async function submitEmailSignup(email: string, turnstileToken: string | null): Promise<void> {
  const { data, error } = await supabase.functions.invoke('email-signup', {
    body: { email, token: turnstileToken, source: 'landing' },
  });
  if (error) throw new EmailSignupError(error.message);
  // The pre-double-opt-in function answers {success: true} and sends nothing.
  if (data?.confirmation !== 'requested') throw new EmailSignupError('email-signup did not request a confirmation');
}
