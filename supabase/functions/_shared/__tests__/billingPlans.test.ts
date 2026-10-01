import { describe, it, expect } from 'vitest';
import { PLANS } from '@/lib/billing/plans';
import {
  CHECKOUT_PRICE_IDS,
  PLAN_PRICES,
  PLAN_PRODUCTS,
  isCheckoutPrice,
  planForPrice,
  planForProduct,
  type PaidPlanId,
} from '../billingPlans';

const PAID: PaidPlanId[] = ['pro', 'family'];
const clientPlan = (id: PaidPlanId) => PLANS.find((p) => p.id === id)!;

describe('billingPlans mirrors src/lib/billing/plans.ts', () => {
  it('has the same prices and products for each paid plan', () => {
    for (const id of PAID) {
      const plan = clientPlan(id);
      expect(PLAN_PRICES[id]).toEqual({ monthly: plan.prices?.monthly?.priceId, yearly: plan.prices?.yearly?.priceId });
      expect([...PLAN_PRODUCTS[id]].sort()).toEqual([...plan.productIds].sort());
    }
  });

  it('lets a customer check out with every price in plans.ts and nothing else', () => {
    const clientPrices = PLANS.flatMap((p) =>
      [p.prices?.monthly?.priceId, p.prices?.yearly?.priceId].filter((id): id is string => Boolean(id)),
    );
    expect([...CHECKOUT_PRICE_IDS].sort()).toEqual([...clientPrices].sort());
  });

  // The Family product is created by hand in the Stripe dashboard; this
  // fails until its ids replace the placeholders, so they can't ship.
  it('has real Stripe ids for every plan', () => {
    for (const id of PAID) {
      for (const stripeId of [...PLAN_PRODUCTS[id], PLAN_PRICES[id].monthly, PLAN_PRICES[id].yearly]) {
        expect(stripeId).toMatch(/^(prod|price)_[A-Za-z0-9]+$/);
        expect(stripeId).not.toMatch(/PLACEHOLDER/);
      }
    }
  });
});

describe('isCheckoutPrice', () => {
  it('accepts our prices and rejects anything else', () => {
    for (const id of CHECKOUT_PRICE_IDS) expect(isCheckoutPrice(id)).toBe(true);
    expect(isCheckoutPrice('price_someone_elses')).toBe(false);
    expect(isCheckoutPrice('')).toBe(false);
  });
});

describe('planForProduct', () => {
  it('maps each product to its plan, and anything else to null', () => {
    for (const id of PAID) for (const product of PLAN_PRODUCTS[id]) expect(planForProduct(product)).toBe(id);
    expect(planForProduct('prod_someone_elses')).toBeNull();
    expect(planForProduct(null)).toBeNull();
  });
});

describe('planForPrice', () => {
  it('maps each price to its plan and interval', () => {
    expect(planForPrice(PLAN_PRICES.pro.monthly)).toEqual({ plan: 'pro', interval: 'monthly' });
    expect(planForPrice(PLAN_PRICES.family.yearly)).toEqual({ plan: 'family', interval: 'yearly' });
    expect(planForPrice('price_someone_elses')).toBeNull();
    expect(planForPrice(undefined)).toBeNull();
  });
});
