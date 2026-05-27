import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { SubscriptionStatus } from '@/lib/billing/plans';

const authState: { subscription: SubscriptionStatus } = {
  subscription: {
    subscribed: false,
    productId: null,
    subscriptionEnd: null,
    cancelAtPeriodEnd: false,
    paymentPastDue: false,
    hasStripeHistory: false,
  },
};

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => authState,
}));

const portfolioState = { isMockData: false };
vi.mock('@/contexts/PortfolioContext', () => ({
  usePortfolio: () => portfolioState,
}));

import { useEntitlements } from '@/hooks/useEntitlements';

const PRO_PRODUCT_ID = 'prod_UWriaLlxoMTR4K';

const FREE_SUB: SubscriptionStatus = {
  subscribed: false,
  productId: null,
  subscriptionEnd: null,
  cancelAtPeriodEnd: false,
  paymentPastDue: false,
  hasStripeHistory: false,
};

const PRO_SUB: SubscriptionStatus = {
  subscribed: true,
  productId: PRO_PRODUCT_ID,
  subscriptionEnd: null,
  cancelAtPeriodEnd: false,
  paymentPastDue: false,
  hasStripeHistory: true,
};

beforeEach(() => {
  authState.subscription = { ...FREE_SUB };
  portfolioState.isMockData = false;
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
    authState.subscription = { subscribed: true, productId: 'prod_UNKNOWN', subscriptionEnd: null, cancelAtPeriodEnd: false, paymentPastDue: false, hasStripeHistory: true };
    const { result } = renderHook(() => useEntitlements());
    expect(result.current.plan.id).toBe('free');
  });

  it('uses free plan when subscribed=false even if productId is non-null (stale state guard)', () => {
    authState.subscription = { subscribed: false, productId: PRO_PRODUCT_ID, subscriptionEnd: null, cancelAtPeriodEnd: false, paymentPastDue: false, hasStripeHistory: false };
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

  it('demo mode short-circuits every entitlement to true even on the free plan', () => {
    portfolioState.isMockData = true;
    const { result } = renderHook(() => useEntitlements());
    expect(result.current.plan.id).toBe('free');
    expect(result.current.has('history.full')).toBe(true);
    expect(result.current.has('benchmarks')).toBe(true);
    expect(result.current.has('milestones')).toBe(true);
    expect(result.current.has('export.pdf')).toBe(true);
  });

  describe('dev plan override (quantive-test-plan)', () => {
    afterEach(() => {
      try { window.localStorage.removeItem('quantive-test-plan'); } catch { /* noop */ }
    });

    it('"pro" override resolves to the Pro plan with all entitlements', () => {
      window.localStorage.setItem('quantive-test-plan', 'pro');
      const { result } = renderHook(() => useEntitlements());
      expect(result.current.plan.id).toBe('pro');
      expect(result.current.has('history.full')).toBe(true);
      expect(result.current.has('forecasting')).toBe(true);
    });

    it('"free" override resolves to the Free plan and gates everything', () => {
      window.localStorage.setItem('quantive-test-plan', 'free');
      authState.subscription = { ...PRO_SUB }; // override should win over the real Pro sub
      const { result } = renderHook(() => useEntitlements());
      expect(result.current.plan.id).toBe('free');
      expect(result.current.has('history.full')).toBe(false);
      expect(result.current.has('benchmarks')).toBe(false);
    });

    it('"free" override wins over demo (isMockData) unlock — tests opting into Free see Free gates', () => {
      window.localStorage.setItem('quantive-test-plan', 'free');
      portfolioState.isMockData = true;
      const { result } = renderHook(() => useEntitlements());
      expect(result.current.plan.id).toBe('free');
      // Without the carve-out, isMockData would return true here.
      expect(result.current.has('history.full')).toBe(false);
      expect(result.current.has('export.pdf')).toBe(false);
    });

    it('"pro" override on a demo dashboard is idempotent — every entitlement is on', () => {
      window.localStorage.setItem('quantive-test-plan', 'pro');
      portfolioState.isMockData = true;
      const { result } = renderHook(() => useEntitlements());
      expect(result.current.plan.id).toBe('pro');
      expect(result.current.has('history.full')).toBe(true);
      expect(result.current.has('milestones')).toBe(true);
    });

    it('unknown override id falls back to real plan resolution', () => {
      window.localStorage.setItem('quantive-test-plan', 'nonsense');
      authState.subscription = { ...PRO_SUB };
      const { result } = renderHook(() => useEntitlements());
      // Override returned null → plan resolves from subscription → Pro.
      expect(result.current.plan.id).toBe('pro');
    });
  });
});
