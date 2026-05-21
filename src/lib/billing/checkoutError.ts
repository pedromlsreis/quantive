// Maps the stable error codes returned by the `create-checkout` edge function
// to user-facing toast messages. The codes are the contract between client
// and server; the strings here are presentation only and can change without
// touching the function. See supabase/functions/create-checkout/index.ts.

export type CheckoutErrorCode =
  | 'unauthenticated'
  | 'email_unverified'
  | 'invalid_request'
  | 'checkout_unavailable';

/**
 * The Supabase functions client wraps the non-2xx Response on the error
 * object's `context` field. Read it back to recover the sanitised code; any
 * parse failure falls through to `undefined` (handled as the generic case).
 */
export async function extractCheckoutErrorCode(error: unknown): Promise<string | undefined> {
  const ctx = (error as { context?: Response } | null)?.context;
  if (!ctx || typeof ctx.json !== 'function') return undefined;
  try {
    const body = await ctx.clone().json();
    return typeof body?.error === 'string' ? body.error : undefined;
  } catch {
    return undefined;
  }
}

export function messageForCheckoutError(code: string | undefined): string {
  switch (code) {
    case 'unauthenticated':
      return 'Your session expired. Please sign in again, then try subscribing.';
    case 'email_unverified':
      return 'Confirm your email first — check the link we sent you.';
    case 'invalid_request':
      return "That plan isn't available anymore. Refresh the page and try again.";
    case 'rate_limited':
      return 'A few too many attempts in a row. Wait a minute and try again.';
    case 'checkout_unavailable':
    default:
      return "We couldn't open checkout. Try again in a moment, or email support@usequantive.app if it keeps failing.";
  }
}

/**
 * Mirror of messageForCheckoutError for the customer-portal endpoint.
 * Same code contract; different surface (Settings → Manage billing).
 */
export function messageForPortalError(code: string | undefined): string {
  switch (code) {
    case 'unauthenticated':
      return 'Your session expired. Please sign in again, then try opening billing.';
    case 'not_found':
      return "We couldn't find your billing record. If you've never subscribed, there's nothing to manage yet.";
    case 'rate_limited':
      return 'A few too many attempts in a row. Wait a minute and try again.';
    case 'portal_unavailable':
    default:
      return "We couldn't open the billing portal. Try again in a moment, or email support@usequantive.app if it keeps failing.";
  }
}
