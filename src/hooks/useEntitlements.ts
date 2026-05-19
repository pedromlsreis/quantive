import { useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { type Entitlement, type Plan, planHas, resolvePlan, PLANS, FREE_PLAN } from '@/lib/billing/plans';

/**
 * Dev/test-only override for the resolved plan. Honoured ONLY when the build
 * is running under Vite dev mode (or when explicitly compiled via tests).
 * Lets Playwright drive Pro/Free flows without provisioning real Stripe data.
 * Set `localStorage.setItem('quantive-test-plan', 'pro' | 'free')`.
 *
 * Production builds (import.meta.env.PROD === true) ignore this entirely —
 * the override branch is dead code that minification removes.
 */
function devPlanOverride(): Plan | null {
  if (!import.meta.env.DEV) return null;
  try {
    const raw = window.localStorage.getItem('quantive-test-plan');
    if (!raw) return null;
    if (raw === 'free') return FREE_PLAN;
    const match = PLANS.find((p) => p.id === raw);
    return match ?? null;
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
    const override = devPlanOverride();
    const plan = override ?? resolvePlan(subscription.subscribed ? subscription.productId : null);
    return {
      plan,
      has: (entitlement: Entitlement) => planHas(plan, entitlement),
    };
  }, [subscription.subscribed, subscription.productId]);
}
