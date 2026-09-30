import { useEffect, type ReactNode } from 'react';
import { useEntitlements } from '@/hooks/useEntitlements';
import { analytics } from '@/lib/analytics';
import type { Entitlement } from '@/lib/billing/plans';
import { UpsellCard, type ProFeature } from './UpsellCard';

/**
 * Renders `children` when the plan includes `feature`; otherwise the
 * fallback. Omitting `fallback` shows the standard Pro gate; passing `null`
 * hides the feature without a prompt (one gate per page).
 */
type FeatureGateProps =
  | { feature: ProFeature; children: ReactNode; fallback?: ReactNode }
  // The standard gate sells Pro, so Family-only features must pass a fallback.
  | { feature: Entitlement; children: ReactNode; fallback: ReactNode };

export function FeatureGate({ feature, children, fallback }: FeatureGateProps) {
  const { has } = useEntitlements();
  const allowed = has(feature);
  const customFallback = fallback !== undefined;

  // The standard gate reports its own impression; count custom fallbacks here.
  useEffect(() => {
    if (!allowed && customFallback) analytics.proGateHit({ feature });
  }, [allowed, customFallback, feature]);

  if (allowed) return <>{children}</>;
  return <>{customFallback ? fallback : <UpsellCard feature={feature as ProFeature} />}</>;
}
