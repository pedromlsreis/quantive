import { describe, it, expect } from 'vitest';
import {
  PLANS,
  FREE_PLAN,
  planHas,
  resolvePlan,
  type SubscriptionStatus,
} from '@/lib/billing/plans';

describe('PLANS', () => {
  it('includes a free and a pro plan', () => {
    expect(PLANS.find((p) => p.id === 'free')).toBeDefined();
    expect(PLANS.find((p) => p.id === 'pro')).toBeDefined();
  });

  it('pro has monthly and yearly prices in EUR, yearly cheaper than 12× monthly', () => {
    const pro = PLANS.find((p) => p.id === 'pro')!;
    expect(pro.prices?.monthly?.amount).toBe(9);
    expect(pro.prices?.yearly?.amount).toBe(90);
    expect(pro.prices?.monthly?.currency).toBe('EUR');
    expect(pro.prices?.yearly!.amount).toBeLessThan(pro.prices!.monthly!.amount * 12);
  });

  it('pro price IDs and product IDs use Stripe prefixes', () => {
    const pro = PLANS.find((p) => p.id === 'pro')!;
    expect(pro.prices?.monthly?.priceId).toMatch(/^price_/);
    expect(pro.prices?.yearly?.priceId).toMatch(/^price_/);
    pro.productIds.forEach((id) => expect(id).toMatch(/^prod_/));
  });
});

describe('resolvePlan', () => {
  it('returns the free plan for null or unknown product IDs', () => {
    expect(resolvePlan(null).id).toBe('free');
    expect(resolvePlan(undefined).id).toBe('free');
    expect(resolvePlan('prod_unknown').id).toBe('free');
  });

  it('matches by product ID', () => {
    const pro = PLANS.find((p) => p.id === 'pro')!;
    expect(resolvePlan(pro.productIds[0]).id).toBe('pro');
  });
});

describe('planHas', () => {
  it('free plan grants no entitlements', () => {
    expect(planHas(FREE_PLAN, 'forecasting')).toBe(false);
    expect(planHas(FREE_PLAN, 'export.csv')).toBe(false);
    expect(planHas(FREE_PLAN, 'history.full')).toBe(false);
  });

  it('pro plan grants the launch entitlements', () => {
    const pro = PLANS.find((p) => p.id === 'pro')!;
    expect(planHas(pro, 'forecasting')).toBe(true);
    expect(planHas(pro, 'history.full')).toBe(true);
    expect(planHas(pro, 'export.excel')).toBe(true);
    expect(planHas(pro, 'export.csv')).toBe(true);
  });
});

describe('SubscriptionStatus type', () => {
  it('can represent an unsubscribed user', () => {
    const s: SubscriptionStatus = {
      subscribed: false,
      productId: null,
      subscriptionEnd: null,
      cancelAtPeriodEnd: false,
      paymentPastDue: false,
    };
    expect(s.subscribed).toBe(false);
  });

  it('can represent a subscribed user', () => {
    const s: SubscriptionStatus = {
      subscribed: true,
      productId: 'prod_abc123',
      subscriptionEnd: '2026-12-31T00:00:00.000Z',
      cancelAtPeriodEnd: false,
      paymentPastDue: false,
    };
    expect(s.subscribed).toBe(true);
    expect(s.productId).toBe('prod_abc123');
  });

  it('can represent a Pro user mid-dunning', () => {
    const s: SubscriptionStatus = {
      subscribed: true,
      productId: 'prod_abc123',
      subscriptionEnd: '2026-12-31T00:00:00.000Z',
      cancelAtPeriodEnd: false,
      paymentPastDue: true,
    };
    expect(s.subscribed).toBe(true);
    expect(s.paymentPastDue).toBe(true);
  });
});
