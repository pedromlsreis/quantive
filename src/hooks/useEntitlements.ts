import { useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { type Entitlement, type Plan, PLANS, planHas, resolvePlan, FREE_PLAN } from '@/lib/billing/plans';

// Dev-only Pro/Free override for Playwright and manual QA. The branch is
// gated on `import.meta.env.DEV` so production bundles dead-code-eliminate it
// (PROD === true short-circuits the test before any localStorage access).
// See progress log on `feat/goals-tracking` and `feat/benchmarks` for the
// original rationale — Agent D will reconcile duplicates at merge.
const TEST_PLAN_KEY = 'quantive-test-plan';

function readTestPlanOverride(): Plan | null {
  if (!import.meta.env.DEV) return null;
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(TEST_PLAN_KEY);
    if (!raw) return null;
    if (raw === 'free') return FREE_PLAN;
    if (raw === 'pro') {
      const pro = PLANS.find((p) => p.id === 'pro');
      return pro ?? null;
    }
    return null;
  } catch {
    return null;
  }
}

export function useEntitlements(): {
  plan: Plan;
  has: (entitlement: Entitlement) => boolean;
} {
  const { subscription } = useAuth();
  return useMemo(() => {
    const override = readTestPlanOverride();
    const plan = override ?? resolvePlan(subscription.subscribed ? subscription.productId : null);
    return {
      plan,
      has: (entitlement: Entitlement) => planHas(plan, entitlement),
    };
  }, [subscription.subscribed, subscription.productId]);
}
