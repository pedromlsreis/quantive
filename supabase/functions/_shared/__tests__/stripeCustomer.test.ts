import { describe, it, expect, vi } from 'vitest';

// stripeCustomer.ts uses `import type Stripe` (erased at compile time) and
// console.warn only — no Deno stubs needed.
import { findStripeCustomer, findOrCreateStripeCustomer } from '../stripeCustomer';

const BASE_CUSTOMER = {
  id: 'cus_test123',
  email: 'user@example.com',
  metadata: { supabase_user_id: 'uid-abc' },
};

function makeStripe({
  searchResult = [] as object[],
  searchThrows = false,
  listResult = [] as object[],
  updateThrows = false,
  createResult = BASE_CUSTOMER as object,
} = {}) {
  return {
    customers: {
      search: searchThrows
        ? vi.fn().mockRejectedValue(new Error('search unavailable'))
        : vi.fn().mockResolvedValue({ data: searchResult }),
      list: vi.fn().mockResolvedValue({ data: listResult }),
      update: updateThrows
        ? vi.fn().mockRejectedValue(new Error('update failed'))
        : vi.fn().mockResolvedValue({}),
      create: vi.fn().mockResolvedValue(createResult),
    },
  };
}

describe('findStripeCustomer', () => {
  it('returns the customer found by metadata search', async () => {
    const stripe = makeStripe({ searchResult: [BASE_CUSTOMER] });
    const result = await findStripeCustomer(stripe as never, 'uid-abc', 'user@example.com');
    expect(result).toEqual(BASE_CUSTOMER);
    expect(stripe.customers.search).toHaveBeenCalledOnce();
    expect(stripe.customers.list).not.toHaveBeenCalled();
  });

  it('falls back to email list when metadata search returns empty', async () => {
    const stripe = makeStripe({ searchResult: [], listResult: [BASE_CUSTOMER] });
    const result = await findStripeCustomer(stripe as never, 'uid-abc', 'user@example.com');
    expect(result).toEqual(BASE_CUSTOMER);
    expect(stripe.customers.list).toHaveBeenCalledWith({ email: 'user@example.com', limit: 1 });
  });

  it('falls back to email list when metadata search throws', async () => {
    const stripe = makeStripe({ searchThrows: true, listResult: [BASE_CUSTOMER] });
    const result = await findStripeCustomer(stripe as never, 'uid-abc', 'user@example.com');
    expect(result).toEqual(BASE_CUSTOMER);
    expect(stripe.customers.list).toHaveBeenCalledOnce();
  });

  it('returns null when no customer is found via search or email', async () => {
    const stripe = makeStripe({ searchResult: [], listResult: [] });
    const result = await findStripeCustomer(stripe as never, 'uid-abc', 'user@example.com');
    expect(result).toBeNull();
  });

  it('backfills supabase_user_id metadata when the email-path customer lacks it', async () => {
    const customerWithoutMeta = { ...BASE_CUSTOMER, metadata: {} };
    const stripe = makeStripe({ searchResult: [], listResult: [customerWithoutMeta] });
    await findStripeCustomer(stripe as never, 'uid-abc', 'user@example.com');
    expect(stripe.customers.update).toHaveBeenCalledWith(
      'cus_test123',
      expect.objectContaining({
        metadata: expect.objectContaining({ supabase_user_id: 'uid-abc' }),
      }),
    );
  });

  it('skips metadata backfill when supabase_user_id already matches', async () => {
    const stripe = makeStripe({ searchResult: [], listResult: [BASE_CUSTOMER] });
    await findStripeCustomer(stripe as never, 'uid-abc', 'user@example.com');
    expect(stripe.customers.update).not.toHaveBeenCalled();
  });

  it('still returns the customer when metadata backfill throws', async () => {
    const customerWithoutMeta = { ...BASE_CUSTOMER, metadata: {} };
    const stripe = makeStripe({
      searchResult: [],
      listResult: [customerWithoutMeta],
      updateThrows: true,
    });
    const result = await findStripeCustomer(stripe as never, 'uid-abc', 'user@example.com');
    expect(result).toEqual(customerWithoutMeta);
  });
});

describe('findOrCreateStripeCustomer', () => {
  it('returns an existing customer and does not call create', async () => {
    const stripe = makeStripe({ searchResult: [BASE_CUSTOMER] });
    const result = await findOrCreateStripeCustomer(stripe as never, 'uid-abc', 'user@example.com');
    expect(result).toEqual(BASE_CUSTOMER);
    expect(stripe.customers.create).not.toHaveBeenCalled();
  });

  it('creates a new customer with correct fields when none is found', async () => {
    const newCustomer = { ...BASE_CUSTOMER, id: 'cus_new' };
    const stripe = makeStripe({ searchResult: [], listResult: [], createResult: newCustomer });
    const result = await findOrCreateStripeCustomer(stripe as never, 'uid-abc', 'user@example.com');
    expect(result).toEqual(newCustomer);
    expect(stripe.customers.create).toHaveBeenCalledWith({
      email: 'user@example.com',
      metadata: { supabase_user_id: 'uid-abc' },
    });
  });
});
