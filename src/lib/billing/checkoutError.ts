// Maps the stable error codes returned by the `create-checkout` edge function
// to user-facing toast messages. The codes are the contract between client
// and server; the strings here are presentation only and can change without
// touching the function. See supabase/functions/create-checkout/index.ts.

export type CheckoutErrorCode =
  | 'unauthenticated'
  | 'email_unverified'
  | 'invalid_request'
  | 'already_subscribed'
  | 'checkout_unavailable';

export { functionErrorCode as extractCheckoutErrorCode } from '@/lib/functionError';

export function messageForCheckoutError(code: string | undefined): string {
  switch (code) {
    case 'unauthenticated':
      return 'Your session expired. Please sign in again, then try subscribing.';
    case 'email_unverified':
      return 'Confirm your email first — check the link we sent you.';
    case 'invalid_request':
      return "That plan isn't available anymore. Refresh the page and try again.";
    case 'already_subscribed':
      return 'You already have a subscription. Change or manage it from Settings.';
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
    case 'not_subscribed':
      return "There's no active subscription to switch. Subscribe to Family from the pricing page instead.";
    case 'already_family':
      return "You're already on Family.";
    case 'rate_limited':
      return 'A few too many attempts in a row. Wait a minute and try again.';
    case 'portal_unavailable':
    default:
      return "We couldn't open the billing portal. Try again in a moment, or email support@usequantive.app if it keeps failing.";
  }
}
