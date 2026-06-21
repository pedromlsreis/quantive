// Pure mapping between Stripe subscription objects and the cache columns
// on public.profiles. Lives in _shared so both the stripe-webhook writer
// and the check-subscription reader stay consistent.

export interface CacheRow {
  subscription_status: string;
  subscription_product_id: string | null;
  subscription_end: string | null;
  subscription_cancel_at_period_end: boolean;
  subscription_synced_at: string;
}

// Minimal Stripe.Subscription shape we depend on. The real SDK type is
// massive and only available inside the Deno bundle; the unit tests work
// against this shape directly.
export interface MinimalSubscription {
  status: string;
  cancel_at_period_end?: boolean | null;
  current_period_end?: number | null;
  items: {
    data: Array<{
      price?: { product?: string | null } | null;
      current_period_end?: number | null;
    }>;
  };
}

export function buildCacheRow(
  sub: MinimalSubscription,
  now: Date = new Date(),
): CacheRow {
  const item = sub.items.data[0];
  // In Stripe API 2025-08-27+ current_period_end moved from the subscription
  // to the item; the top-level field is now often null on new subscriptions.
  const endSeconds = item?.current_period_end ?? sub.current_period_end ?? null;
  return {
    subscription_status: sub.status,
    subscription_product_id: (item?.price?.product as string | null) ?? null,
    subscription_end: endSeconds ? new Date(endSeconds * 1000).toISOString() : null,
    subscription_cancel_at_period_end: sub.cancel_at_period_end ?? false,
    subscription_synced_at: now.toISOString(),
  };
}

export interface SubscriptionView {
  subscribed: boolean;
  product_id: string | null;
  subscription_end: string | null;
  cancel_at_period_end: boolean;
  payment_past_due: boolean;
  // True if the user has ever had a Stripe customer record. The Settings
  // page uses this to keep the "Manage billing" button visible for cancelled
  // users so they can reach the portal for invoices or to reactivate.
  has_stripe_history: boolean;
}

// The three Stripe statuses that grant Pro access. `past_due` is in here deliberately.
const ENTITLED = new Set(["active", "trialing", "past_due"]);

export function viewFromCacheRow(row: {
  subscription_status: string | null;
  subscription_product_id: string | null;
  subscription_end: string | null;
  subscription_cancel_at_period_end: boolean | null;
  stripe_customer_id?: string | null;
}): SubscriptionView {
  const status = row.subscription_status ?? "";
  const entitled = ENTITLED.has(status);
  return {
    subscribed: entitled,
    product_id: entitled ? row.subscription_product_id : null,
    subscription_end: entitled ? row.subscription_end : null,
    cancel_at_period_end: entitled ? (row.subscription_cancel_at_period_end ?? false) : false,
    payment_past_due: status === "past_due",
    has_stripe_history: row.stripe_customer_id != null,
  };
}

export function emptyView(): SubscriptionView {
  return {
    subscribed: false,
    product_id: null,
    subscription_end: null,
    cancel_at_period_end: false,
    payment_past_due: false,
    has_stripe_history: false,
  };
}
