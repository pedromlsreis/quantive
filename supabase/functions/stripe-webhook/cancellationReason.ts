// Pure formatting for Stripe's cancellation_details. Kept separate from
// index.ts so it can be unit-tested without the Deno serve runtime.
//
// Stripe's three overlapping fields:
//   - `reason`   : Stripe's own enum. For portal-initiated cancellations it is
//                  always "cancellation_requested" — useless as a customer
//                  reason. Only carries signal for system cancellations like
//                  "payment_failed" or "payment_disputed".
//   - `feedback` : The radio-button enum the customer picked in the portal
//                  (`too_expensive`, `missing_features`, `other`, ...).
//   - `comment`  : Free-text the customer typed (typically when they pick
//                  `other` in the radio set).
//
// Surface feedback + comment together when present; fall back to `reason`
// only when both are absent.

export interface MinimalCancellationDetails {
  reason?: string | null;
  feedback?: string | null;
  comment?: string | null;
}

export function formatCancellationReason(
  details: MinimalCancellationDetails | null | undefined,
): string {
  if (!details) return "(none provided)";
  const parts: string[] = [];
  if (details.feedback) parts.push(details.feedback);
  if (details.comment) parts.push(`"${details.comment}"`);
  if (parts.length > 0) return parts.join(" — ");
  return details.reason ?? "(none provided)";
}
