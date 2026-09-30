// The Stripe prices a customer may check out with. The source of truth is
// src/lib/billing/plans.ts; edge functions can't import from src/, so this
// list mirrors it and __tests__/billingPlans.test.ts fails if the two drift.
export const CHECKOUT_PRICE_IDS: readonly string[] = [
  "price_1TXnys6exGYK5NsswevJDTQk", // Pro monthly
  "price_1TXnys6exGYK5NssXTjUgqGW", // Pro yearly
];

export function isCheckoutPrice(priceId: string): boolean {
  return CHECKOUT_PRICE_IDS.includes(priceId);
}
