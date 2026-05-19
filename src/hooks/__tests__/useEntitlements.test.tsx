import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { SubscriptionStatus } from '@/lib/billing/plans';

const authState: { subscription: SubscriptionStatus } = {
  subscription: {
    subscribed: false,
    productId: null,
    subscriptionEnd: null,
    cancelAtPeriodEnd: false,
  },
};

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => authState,
}));

import { useEntitlements } from '@/hooks/useEntitlements';

const PRO_PRODUCT_ID = 'prod_UWriaLlxoMTR4K';

const FREE_SUB: SubscriptionStatus = {
  subscribed: false,
  productId: null,
  subscriptionEnd: null,
  cancelAtPeriodEnd: false,
};

const PRO_SUB: SubscriptionStatus = {
  subscribed: true,
  productId: PRO_PRODUCT_ID,
  subscriptionEnd: null,
  cancelAtPeriodEnd: false,
};

beforeEach(() => {
  authState.subscription = { ...FREE_SUB };
});

describe('useEntitlements', () => {
  it('returns free plan when not subscribed', () => {
    const { result } = renderHook(() => useEntitlements());
    expect(result.current.plan.id).toBe('free');
  });

  it('returns pro plan when subscribed with the pro product', () => {
    authState.subscription = { ...PRO_SUB };
    const { result } = renderHook(() => useEntitlements());
    expect(result.current.plan.id).toBe('pro');
  });

  it('unknown productId falls back to free plan', () => {
    authState.subscription = { subscribed: true, productId: 'prod_UNKNOWN', subscriptionEnd: null, cancelAtPeriodEnd: false };
    const { result } = renderHook(() => useEntitlements());
    expect(result.current.plan.id).toBe('free');
  });

  it('uses free plan when subscribed=false even if productId is non-null (stale state guard)', () => {
    authState.subscription = { subscribed: false, productId: PRO_PRODUCT_ID, subscriptionEnd: null, cancelAtPeriodEnd: false };
    const { result } = renderHook(() => useEntitlements());
    expect(result.current.plan.id).toBe('free');
    expect(result.current.has('history.full')).toBe(false);
  });

  it('has() returns false for every entitlement on the free plan', () => {
    const { result } = renderHook(() => useEntitlements());
    expect(result.current.has('history.full')).toBe(false);
    expect(result.current.has('forecasting')).toBe(false);
    expect(result.current.has('export.excel')).toBe(false);
    expect(result.current.has('export.csv')).toBe(false);
    expect(result.current.has('export.pdf')).toBe(false);
    expect(result.current.has('milestones')).toBe(false);
    expect(result.current.has('benchmarks')).toBe(false);
    expect(result.current.has('support.priority')).toBe(false);
  });

  it('has() returns true for every entitlement on the pro plan', () => {
    authState.subscription = { ...PRO_SUB };
    const { result } = renderHook(() => useEntitlements());
    expect(result.current.has('history.full')).toBe(true);
    expect(result.current.has('forecasting')).toBe(true);
    expect(result.current.has('export.excel')).toBe(true);
    expect(result.current.has('export.csv')).toBe(true);
    expect(result.current.has('export.pdf')).toBe(true);
    expect(result.current.has('milestones')).toBe(true);
    expect(result.current.has('benchmarks')).toBe(true);
    expect(result.current.has('support.priority')).toBe(true);
  });
});
