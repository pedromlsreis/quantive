// The Stripe prices a customer may check out with, and the plan each product
// grants. The source of truth is src/lib/billing/plans.ts; edge functions
// can't import from src/, so this mirrors it and
// __tests__/billingPlans.test.ts fails if the two drift.

export type PaidPlanId = "pro" | "family";
export type BillingInterval = "monthly" | "yearly";

export const PLAN_PRICES: Record<PaidPlanId, Record<BillingInterval, string>> = {
  pro: {
    monthly: "price_1TXnys6exGYK5NsswevJDTQk",
    yearly: "price_1TXnys6exGYK5NssXTjUgqGW",
  },
  family: {
    monthly: "price_FAMILY_MONTHLY_PLACEHOLDER",
    yearly: "price_FAMILY_YEARLY_PLACEHOLDER",
  },
};

export const PLAN_PRODUCTS: Record<PaidPlanId, readonly string[]> = {
  pro: ["prod_UWriaLlxoMTR4K"],
  family: ["prod_FAMILY_PLACEHOLDER"],
};

export const CHECKOUT_PRICE_IDS: readonly string[] = Object.values(PLAN_PRICES)
  .flatMap((prices) => [prices.monthly, prices.yearly]);

export function isCheckoutPrice(priceId: string): boolean {
  return CHECKOUT_PRICE_IDS.includes(priceId);
}

/** The plan a Stripe product grants, or null for a product that isn't ours. */
export function planForProduct(productId: string | null | undefined): PaidPlanId | null {
  if (!productId) return null;
  for (const [plan, products] of Object.entries(PLAN_PRODUCTS) as [PaidPlanId, readonly string[]][]) {
    if (products.includes(productId)) return plan;
  }
  return null;
}

/** The plan and interval of one of our prices, or null. */
export function planForPrice(priceId: string | null | undefined): { plan: PaidPlanId; interval: BillingInterval } | null {
  if (!priceId) return null;
  for (const [plan, prices] of Object.entries(PLAN_PRICES) as [PaidPlanId, Record<BillingInterval, string>][]) {
    if (prices.monthly === priceId) return { plan, interval: "monthly" };
    if (prices.yearly === priceId) return { plan, interval: "yearly" };
  }
  return null;
}
