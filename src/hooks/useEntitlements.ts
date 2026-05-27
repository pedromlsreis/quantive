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
export function devPlanOverride(): Plan | null {
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
  const { user, subscription } = useAuth();
  const { isMockData } = usePortfolio();
  return useMemo(() => {
    const override = devPlanOverride();
    const plan = override ?? resolvePlan(subscription.subscribed ? subscription.productId : null);
    // Demo mode short-circuits every entitlement to true so the /demo surface
    // shows the full Pro experience — paywalling the most-persuasive
    // pre-signup view defeats the demo. Real plan resolution resumes the
    // moment the user signs up and `isMockData` flips off.
    //
    // Restricted to unauthed sessions: a signed-in Free user who clicks
    // "Try demo" otherwise gets the full Pro UI client-side over their demo
    // data — purely cosmetic but it confuses the gate's contract. The demo
    // unlock is for the marketing surface, not for converting paying gates
    // into freebies post-signup.
    //
    // Exception: when a dev/test plan override is explicitly set, honour it
    // even over the demo unlock. Playwright drives Free-tier specs by
    // seeding `quantive-test-plan='free'` and then calling `loadDemo` to get
    // a populated dashboard; without this carve-out the override is silently
    // ignored and Free-tier gates render as Pro.
    const demoUnlock = isMockData && !user;
    const has = (entitlement: Entitlement) => {
      if (override) return planHas(plan, entitlement);
      if (demoUnlock) return true;
      return planHas(plan, entitlement);
    };
    return { plan, has };
  }, [user, subscription.subscribed, subscription.productId, isMockData]);
}
