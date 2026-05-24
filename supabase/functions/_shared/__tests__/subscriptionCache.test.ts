import { describe, it, expect } from 'vitest';
import { buildCacheRow, viewFromCacheRow, emptyView } from '../subscriptionCache';

const FIXED_NOW = new Date('2026-05-21T10:00:00.000Z');

function sub(overrides: Partial<{
  status: string;
  cancel_at_period_end: boolean;
  current_period_end: number | null;
  itemPeriodEnd: number | null;
  product: string | null;
}> = {}) {
  return {
    status: overrides.status ?? 'active',
    cancel_at_period_end: overrides.cancel_at_period_end ?? false,
    current_period_end: overrides.current_period_end ?? null,
    items: {
      data: [
        {
          price: { product: overrides.product ?? 'prod_test' },
          current_period_end: overrides.itemPeriodEnd ?? null,
        },
      ],
    },
  };
}

describe('buildCacheRow', () => {
  it('uses item.current_period_end when present (Stripe API 2025-08-27+)', () => {
    const row = buildCacheRow(sub({ itemPeriodEnd: 1_800_000_000 }), FIXED_NOW);
    expect(row.subscription_end).toBe(new Date(1_800_000_000_000).toISOString());
  });

  it('falls back to subscription.current_period_end on older subs', () => {
    const row = buildCacheRow(
      sub({ current_period_end: 1_700_000_000, itemPeriodEnd: null }),
      FIXED_NOW,
    );
    expect(row.subscription_end).toBe(new Date(1_700_000_000_000).toISOString());
  });

  it('emits null subscription_end when neither field is set', () => {
    const row = buildCacheRow(sub({}), FIXED_NOW);
    expect(row.subscription_end).toBeNull();
  });

  it('copies status, product, cancel_at_period_end verbatim', () => {
    const row = buildCacheRow(sub({ status: 'past_due', cancel_at_period_end: true, product: 'prod_pro' }), FIXED_NOW);
    expect(row.subscription_status).toBe('past_due');
    expect(row.subscription_product_id).toBe('prod_pro');
    expect(row.subscription_cancel_at_period_end).toBe(true);
  });

  it('stamps subscription_synced_at with the provided now', () => {
    const row = buildCacheRow(sub({}), FIXED_NOW);
    expect(row.subscription_synced_at).toBe(FIXED_NOW.toISOString());
  });
});

describe('viewFromCacheRow', () => {
  it('marks active subscriptions as subscribed', () => {
    const view = viewFromCacheRow({
      subscription_status: 'active',
      subscription_product_id: 'prod_pro',
      subscription_end: '2026-12-31T00:00:00.000Z',
      subscription_cancel_at_period_end: false,
      stripe_customer_id: 'cus_active',
    });
    expect(view).toEqual({
      subscribed: true,
      product_id: 'prod_pro',
      subscription_end: '2026-12-31T00:00:00.000Z',
      cancel_at_period_end: false,
      payment_past_due: false,
      has_stripe_history: true,
    });
  });

  it('keeps trialing subscriptions entitled', () => {
    const view = viewFromCacheRow({
      subscription_status: 'trialing',
      subscription_product_id: 'prod_pro',
      subscription_end: '2026-06-30T00:00:00.000Z',
      subscription_cancel_at_period_end: false,
    });
    expect(view.subscribed).toBe(true);
    expect(view.payment_past_due).toBe(false);
  });

  it('keeps past_due subscriptions entitled and flags payment_past_due', () => {
    // This is the dunning-grace policy from subscription-tiers.md — verifying
    // it at the cache-read boundary too.
    const view = viewFromCacheRow({
      subscription_status: 'past_due',
      subscription_product_id: 'prod_pro',
      subscription_end: '2026-12-31T00:00:00.000Z',
      subscription_cancel_at_period_end: false,
    });
    expect(view.subscribed).toBe(true);
    expect(view.payment_past_due).toBe(true);
  });

  it('treats canceled / null / unknown statuses as unsubscribed', () => {
    for (const status of ['canceled', 'incomplete', 'unpaid', 'paused', null, '']) {
      const view = viewFromCacheRow({
        subscription_status: status as string | null,
        subscription_product_id: 'prod_pro',
        subscription_end: '2026-12-31T00:00:00.000Z',
        subscription_cancel_at_period_end: true,
      });
      expect(view.subscribed).toBe(false);
      expect(view.product_id).toBeNull();
      expect(view.subscription_end).toBeNull();
      expect(view.cancel_at_period_end).toBe(false);
      expect(view.payment_past_due).toBe(false);
    }
  });

  it('flags has_stripe_history when a cancelled row still carries a customer id', () => {
    const view = viewFromCacheRow({
      subscription_status: 'canceled',
      subscription_product_id: null,
      subscription_end: null,
      subscription_cancel_at_period_end: false,
      stripe_customer_id: 'cus_excustomer',
    });
    expect(view.subscribed).toBe(false);
    expect(view.has_stripe_history).toBe(true);
  });
});

describe('emptyView', () => {
  it('is the canonical no-subscription response shape', () => {
    expect(emptyView()).toEqual({
      subscribed: false,
      product_id: null,
      subscription_end: null,
      cancel_at_period_end: false,
      payment_past_due: false,
      has_stripe_history: false,
    });
  });
});
