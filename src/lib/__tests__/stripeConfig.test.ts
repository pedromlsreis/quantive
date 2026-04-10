import { describe, it, expect } from 'vitest';
import { STRIPE_CONFIG } from '@/lib/stripeConfig';
import type { SubscriptionStatus } from '@/lib/stripeConfig';

describe('STRIPE_CONFIG', () => {
  it('has pro tier with monthly and yearly prices', () => {
    expect(STRIPE_CONFIG.pro).toBeDefined();
    expect(STRIPE_CONFIG.pro.monthly).toBeDefined();
    expect(STRIPE_CONFIG.pro.yearly).toBeDefined();
  });

  it('monthly price is €9', () => {
    expect(STRIPE_CONFIG.pro.monthly.amount).toBe(9);
  });

  it('yearly price is €90 (2 months free)', () => {
    expect(STRIPE_CONFIG.pro.yearly.amount).toBe(90);
    // Yearly should be cheaper than 12 * monthly
    expect(STRIPE_CONFIG.pro.yearly.amount).toBeLessThan(STRIPE_CONFIG.pro.monthly.amount * 12);
  });

  it('price IDs are non-empty strings starting with price_', () => {
    expect(STRIPE_CONFIG.pro.monthly.price_id).toMatch(/^price_/);
    expect(STRIPE_CONFIG.pro.yearly.price_id).toMatch(/^price_/);
  });

  it('product_ids are non-empty strings starting with prod_', () => {
    STRIPE_CONFIG.pro.product_ids.forEach(id => {
      expect(id).toMatch(/^prod_/);
    });
  });
});

describe('SubscriptionStatus type', () => {
  it('can represent an unsubscribed user', () => {
    const status: SubscriptionStatus = {
      subscribed: false,
      productId: null,
      subscriptionEnd: null,
    };
    expect(status.subscribed).toBe(false);
    expect(status.productId).toBeNull();
  });

  it('can represent a subscribed user', () => {
    const status: SubscriptionStatus = {
      subscribed: true,
      productId: 'prod_abc123',
      subscriptionEnd: '2025-12-31T00:00:00.000Z',
    };
    expect(status.subscribed).toBe(true);
    expect(status.productId).toBe('prod_abc123');
  });
});
