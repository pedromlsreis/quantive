import { useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { type Entitlement, type Plan, PLANS, FREE_PLAN, planHas, resolvePlan } from '@/lib/billing/plans';

// Dev-only Pro/Free override for Playwright. Reads `localStorage.quantive-test-plan`
// ('pro' or 'free') and substitutes the plan. Dead-code-eliminated from
// production bundles via the `import.meta.env.DEV` short-circuit — Vite
// inlines `import.meta.env.DEV` as `false` in `build`, so the entire branch
// (and the localStorage read) drops out at minification.
//
// This is a temporary affordance for end-to-end tests until a real Stripe
// test-customer harness exists; Agent A introduced it for the goals spec,
// duplicated here so the benchmarks spec can drive Pro/Free states the same way.
function devPlanOverride(): Plan | null {
  if (!import.meta.env.DEV) return null;
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem('quantive-test-plan');
    if (raw === 'pro') {
      return PLANS.find((p) => p.id === 'pro') ?? null;
    }
    if (raw === 'free') {
      return FREE_PLAN;
    }
  } catch {
    // localStorage unavailable — ignore
  }
  return null;
}

export function useEntitlements(): {
  plan: Plan;
  has: (entitlement: Entitlement) => boolean;
} {
  const { subscription } = useAuth();
  return useMemo(() => {
    const override = devPlanOverride();
    const plan = override
      ?? resolvePlan(subscription.subscribed ? subscription.productId : null);
    return {
      plan,
      has: (entitlement: Entitlement) => planHas(plan, entitlement),
    };
  }, [subscription.subscribed, subscription.productId]);
}
