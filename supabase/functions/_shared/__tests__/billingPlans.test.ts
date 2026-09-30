import { describe, it, expect } from 'vitest';
import { PLANS } from '@/lib/billing/plans';
import { CHECKOUT_PRICE_IDS, isCheckoutPrice } from '../billingPlans';

describe('CHECKOUT_PRICE_IDS', () => {
  it('matches every price in src/lib/billing/plans.ts', () => {
    const clientPrices = PLANS.flatMap((p) =>
      [p.prices?.monthly?.priceId, p.prices?.yearly?.priceId].filter((id): id is string => Boolean(id)),
    );
    expect([...CHECKOUT_PRICE_IDS].sort()).toEqual([...clientPrices].sort());
  });
});

describe('isCheckoutPrice', () => {
  it('accepts our prices and rejects anything else', () => {
    for (const id of CHECKOUT_PRICE_IDS) expect(isCheckoutPrice(id)).toBe(true);
    expect(isCheckoutPrice('price_someone_elses')).toBe(false);
    expect(isCheckoutPrice('')).toBe(false);
  });
});
