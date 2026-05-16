import { useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { type Entitlement, type Plan, planHas, resolvePlan } from '@/lib/billing/plans';

export function useEntitlements(): {
  plan: Plan;
  has: (entitlement: Entitlement) => boolean;
} {
  const { subscription } = useAuth();
  return useMemo(() => {
    const plan = resolvePlan(subscription.subscribed ? subscription.productId : null);
    return {
      plan,
      has: (entitlement: Entitlement) => planHas(plan, entitlement),
    };
  }, [subscription.subscribed, subscription.productId]);
}
