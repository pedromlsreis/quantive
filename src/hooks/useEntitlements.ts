import { useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { usePortfolio } from '@/contexts/PortfolioContext';
import { type Entitlement, type Plan, PLANS, FREE_PLAN, planHas, resolvePlan } from '@/lib/billing/plans';

/**
 * Dev/test-only override for the resolved plan. Honoured ONLY when the build
 * is running under Vite dev mode. Lets Playwright drive Pro/Free flows
 * without provisioning real Stripe data.
 *
 * Set `localStorage.setItem('quantive-test-plan', 'pro' | 'free')`.
 *
 * Production builds (import.meta.env.PROD === true) ignore this entirely —
 * Vite inlines `import.meta.env.DEV` as `false` in `build`, so the entire
 * branch (and the localStorage read) drops out at minification.
 */
function devPlanOverride(): Plan | null {
  if (!import.meta.env.DEV) return null;
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem('quantive-test-plan');
    if (!raw) return null;
    if (raw === 'free') return FREE_PLAN;
    const match = PLANS.find((p) => p.id === raw);
    return match ?? null;
  } catch {
    // localStorage unavailable — ignore
    return null;
  }
}

export function useEntitlements(): {
  plan: Plan;
  has: (entitlement: Entitlement) => boolean;
} {
  const { subscription } = useAuth();
  const { isMockData } = usePortfolio();
  return useMemo(() => {
    const override = devPlanOverride();
    const plan = override ?? resolvePlan(subscription.subscribed ? subscription.productId : null);
    // Demo mode short-circuits every entitlement to true so the /demo surface
    // shows the full Pro experience — paywalling the most-persuasive
    // pre-signup view defeats the demo. Real plan resolution resumes the
    // moment the user signs up and `isMockData` flips off.
    const has = (entitlement: Entitlement) =>
      isMockData ? true : planHas(plan, entitlement);
    return { plan, has };
  }, [subscription.subscribed, subscription.productId, isMockData]);
}
