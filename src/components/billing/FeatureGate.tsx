import { useEffect, type ReactNode } from 'react';
import { useEntitlements } from '@/hooks/useEntitlements';
import { analytics } from '@/lib/analytics';
import type { Entitlement } from '@/lib/billing/plans';
import { UpsellCard } from './UpsellCard';

export function FeatureGate({
  feature,
  children,
  fallback,
}: {
  feature: Entitlement;
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const { has } = useEntitlements();
  const allowed = has(feature);

  useEffect(() => {
    if (!allowed) analytics.proGateHit({ feature });
  }, [allowed, feature]);

  if (allowed) return <>{children}</>;
  return <>{fallback ?? <UpsellCard feature={feature} />}</>;
}
