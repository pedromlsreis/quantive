// Detect the cancel_at_period_end transitions that warrant an admin email
// on customer.subscription.updated events. The webhook fires for any field
// change (status, quantity, price, etc.) so we filter down to the two
// signals that actually matter operationally: a customer requesting a
// cancellation, and a customer reverting one.

export type CancellationTransition =
  | { kind: "none" }
  | { kind: "started" }
  | { kind: "reverted" };

export function cancellationTransition(
  prev: { cancel_at_period_end?: boolean } | undefined | null,
  current: { cancel_at_period_end?: boolean | null },
): CancellationTransition {
  // No previous_attributes, or it didn't include cancel_at_period_end:
  // the update changed something we don't care about. Stay quiet.
  if (!prev || prev.cancel_at_period_end === undefined) return { kind: "none" };

  const wasCancelling = prev.cancel_at_period_end === true;
  const isCancelling = current.cancel_at_period_end === true;
  if (wasCancelling === isCancelling) return { kind: "none" };
  return { kind: isCancelling ? "started" : "reverted" };
}
