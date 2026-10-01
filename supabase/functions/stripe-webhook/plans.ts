// Which plan a Stripe subscription is for, and whether an update changed
// it. Pure, so it's unit-tested without the Deno serve runtime.

import { planForProduct, type PaidPlanId } from "../_shared/billingPlans.ts";

export const PLAN_NAMES: Record<PaidPlanId, string> = { pro: "Pro", family: "Family" };

interface ItemLike {
  price?: { product?: string | { id: string } | null } | null;
}

interface SubscriptionLike {
  items: { data: ItemLike[] };
}

function itemPlan(item: ItemLike | undefined): PaidPlanId | null {
  const product = item?.price?.product;
  return planForProduct(typeof product === "string" ? product : product?.id ?? null);
}

/** Our subscriptions have one item, so its product names the plan. */
export function subscriptionPlan(sub: SubscriptionLike): PaidPlanId | null {
  return itemPlan(sub.items.data[0]);
}

/**
 * The plan change in a customer.subscription.updated event, or null. Stripe
 * puts `items` in previous_attributes only when the items changed.
 */
export function planChange(
  previous: { items?: { data?: ItemLike[] } } | undefined,
  sub: SubscriptionLike,
): { from: PaidPlanId | null; to: PaidPlanId | null } | null {
  if (!previous?.items?.data) return null;
  const from = itemPlan(previous.items.data[0]);
  const to = subscriptionPlan(sub);
  return from === to ? null : { from, to };
}

/** "Family, 120 EUR / year" for admin emails. */
export function planLabel(plan: PaidPlanId | null, amount: number, currency: string, interval: string): string {
  return `${plan ? PLAN_NAMES[plan] : "Unknown plan"}, ${amount} ${currency} / ${interval}`;
}
