/**
 * Email capture — the client side of the wiring.
 *
 * Submits to the `email-signup` Supabase Edge Function, which verifies the
 * Cloudflare Turnstile token, rate-limits per IP, and inserts into the
 * email_signups table as service_role. See supabase/functions/email-signup.
 *
 * Deploy checklist (the function + table must be live before this ships, since
 * pushing to main auto-deploys the frontend):
 *   1. Apply migration 20260619120000_email_signups.sql.
 *   2. `supabase functions deploy email-signup`.
 *   3. `supabase secrets set TURNSTILE_SECRET_KEY=…` (the same secret as Auth's
 *      Turnstile) so the captcha is enforced; without it the function skips
 *      verification and the form still works, just unguarded.
 */
import { supabase } from '@/integrations/supabase/client';

/**
 * Gates rendering of the email-capture block on the landing page. The form
 * calls the deployed Edge Function above, so keep this in step with whether
 * that function is live.
 */
export const EMAIL_CAPTURE_ENABLED = true;

/** Thrown when the signup request fails (network, captcha, or server error). */
export class EmailSignupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EmailSignupError';
  }
}

/**
 * Submit one email to the capture list. `turnstileToken` is the Cloudflare
 * Turnstile token, or null when the widget is disabled (no site key); the
 * function enforces it only when its secret is configured. Resolves on success,
 * throws EmailSignupError on any failure.
 */
export async function submitEmailSignup(email: string, turnstileToken: string | null): Promise<void> {
  const { error } = await supabase.functions.invoke('email-signup', {
    body: { email, token: turnstileToken, source: 'landing' },
  });
  if (error) throw new EmailSignupError(error.message);
}
