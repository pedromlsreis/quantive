// Source of truth for billing plans and what each one unlocks.
// Adding a new plan (e.g. Family): append to PLANS with its Stripe product IDs
// and the entitlements it grants. Call sites read entitlements, not plan names.

export type Entitlement =
  | 'history.full'
  | 'forecasting'
  | 'export.excel'
  | 'export.csv'
  | 'export.pdf'
  | 'milestones'
  | 'benchmarks'
  | 'support.priority';

export type PriceRef = {
  priceId: string;
  amount: number;
  currency: 'EUR';
};

export type Plan = {
  id: string;
  name: string;
  productIds: string[];
  prices?: {
    monthly?: PriceRef;
    yearly?: PriceRef;
  };
  entitlements: readonly Entitlement[];
};

export const FREE_PLAN: Plan = {
  id: 'free',
  name: 'Free',
  productIds: [],
  entitlements: [],
};

export const PLANS: readonly Plan[] = [
  FREE_PLAN,
  {
    id: 'pro',
    name: 'Pro',
    productIds: ['prod_UWmA6EYMASerBY'],
    prices: {
      monthly: { priceId: 'price_1TXibk5dFPMz9tjKmeIklZc1', amount: 9, currency: 'EUR' },
      yearly: { priceId: 'price_1TXid55dFPMz9tjKvVe2bKDk', amount: 90, currency: 'EUR' },
    },
    entitlements: [
      'history.full',
      'forecasting',
      'export.excel',
      'export.csv',
      'export.pdf',
      'milestones',
      'benchmarks',
      'support.priority',
    ],
  },
] as const;

export function resolvePlan(productId: string | null | undefined): Plan {
  if (!productId) return FREE_PLAN;
  return PLANS.find((p) => p.productIds.includes(productId)) ?? FREE_PLAN;
}

export function planHas(plan: Plan, entitlement: Entitlement): boolean {
  return plan.entitlements.includes(entitlement);
}

export type SubscriptionStatus = {
  subscribed: boolean;
  productId: string | null;
  subscriptionEnd: string | null;
  cancelAtPeriodEnd: boolean;
};
