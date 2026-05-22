// Cancels every active or trialing Stripe subscription for a customer
// before we drop the user from our DB. Without this step a self-deleted
// Pro user keeps getting charged on renewal — Stripe knows nothing about
// our `auth.users` table.
//
// Cancellation is *immediate* (not cancel_at_period_end). Rationale:
//   1. The user has just chosen an irreversible "delete my account" path.
//      They have no account left to enjoy the remainder of the period from.
//   2. cancel_at_period_end would leave a phantom subscription on the
//      customer for weeks, complicating MRR reporting and any future
//      re-subscribe (Stripe would route them through reactivation flows).
//   3. The corresponding subscription.deleted webhook fires immediately;
//      since our profiles row is about to be deleted, the webhook handler
//      will no-op cleanly (resolveCustomer returns userId=null).
//
// Status filter: we include `active`, `trialing`, and `past_due`. Anything
// already `canceled`, `incomplete`, `incomplete_expired`, or `unpaid` is a
// terminal state that does not need a fresh cancel call. We do NOT filter
// out cancel_at_period_end=true — those are still actively billing-eligible
// until period_end and must be cancelled hard.

const STATUSES_TO_CANCEL = new Set(["active", "trialing", "past_due"]);

interface StripeLike {
  subscriptions: {
    list(params: {
      customer: string;
      status?: "all" | "active" | "trialing" | "past_due" | "canceled" | "incomplete" | "incomplete_expired" | "unpaid";
      limit?: number;
    }): Promise<{ data: Array<{ id: string; status: string }> }>;
    cancel(id: string): Promise<{ id: string; status: string }>;
  };
}

export interface CancelResult {
  cancelled: string[];
  skipped: Array<{ id: string; status: string }>;
  errors: Array<{ id: string; message: string }>;
}

export async function cancelActiveSubscriptions(
  stripe: StripeLike,
  customerId: string | null | undefined,
): Promise<CancelResult> {
  const result: CancelResult = { cancelled: [], skipped: [], errors: [] };
  if (!customerId) return result;

  const subs = await stripe.subscriptions.list({
    customer: customerId,
    status: "all",
    limit: 100,
  });

  for (const sub of subs.data) {
    if (!STATUSES_TO_CANCEL.has(sub.status)) {
      result.skipped.push({ id: sub.id, status: sub.status });
      continue;
    }
    try {
      await stripe.subscriptions.cancel(sub.id);
      result.cancelled.push(sub.id);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      result.errors.push({ id: sub.id, message });
    }
  }

  return result;
}

// Convenience: true iff every billing-eligible subscription is now terminal.
// The delete-account flow uses this to decide whether to proceed (true) or
// abort with a 500 so the user can retry (false).
export function isFullyCancelled(result: CancelResult): boolean {
  return result.errors.length === 0;
}
