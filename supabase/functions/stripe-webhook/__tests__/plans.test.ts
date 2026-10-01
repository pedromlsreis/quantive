import { describe, it, expect } from 'vitest';
import { PLAN_PRODUCTS } from '../../_shared/billingPlans';
import { planChange, planLabel, subscriptionPlan } from '../plans';

const PRO = PLAN_PRODUCTS.pro[0];
const FAMILY = PLAN_PRODUCTS.family[0];
const sub = (product: string | { id: string } | null) => ({ items: { data: [{ price: { product } }] } });

describe('subscriptionPlan', () => {
  it('reads the plan from the first item, expanded or not', () => {
    expect(subscriptionPlan(sub(PRO))).toBe('pro');
    expect(subscriptionPlan(sub({ id: FAMILY }))).toBe('family');
    expect(subscriptionPlan(sub('prod_someone_elses'))).toBeNull();
    expect(subscriptionPlan({ items: { data: [] } })).toBeNull();
  });
});

describe('planChange', () => {
  it('reports a switch from Pro to Family', () => {
    expect(planChange({ items: { data: [{ price: { product: PRO } }] } }, sub(FAMILY))).toEqual({ from: 'pro', to: 'family' });
  });

  it('ignores updates that leave the items alone or keep the plan', () => {
    expect(planChange(undefined, sub(FAMILY))).toBeNull();
    expect(planChange({}, sub(FAMILY))).toBeNull();
    // Monthly to yearly on the same plan: the items change, the plan doesn't.
    expect(planChange({ items: { data: [{ price: { product: FAMILY } }] } }, sub(FAMILY))).toBeNull();
  });
});

describe('planLabel', () => {
  it('names the plan with its price', () => {
    expect(planLabel('family', 120, 'EUR', 'year')).toBe('Family, 120 EUR / year');
    expect(planLabel(null, 9, 'EUR', 'month')).toBe('Unknown plan, 9 EUR / month');
  });
});
