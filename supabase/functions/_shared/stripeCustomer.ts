// Resolves a Stripe customer for an authenticated Supabase user.
// Primary key is metadata.supabase_user_id, set when we create the customer.
// Email is used as a fallback so legacy customers (created before this code
// landed) keep working until they next interact, at which point we backfill
// the metadata.
//
// Why search-then-list? `customers.search` has eventual consistency (a few
// seconds), so a brand-new customer might not appear immediately. The email
// list path is exact-match and synchronous.

import type Stripe from "https://esm.sh/stripe@18.5.0";

export async function findStripeCustomer(
  stripe: Stripe,
  userId: string,
  email: string,
): Promise<Stripe.Customer | null> {
  // 1) Metadata-keyed search (preferred)
  try {
    const search = await stripe.customers.search({
      query: `metadata['supabase_user_id']:'${userId}'`,
      limit: 1,
    });
    if (search.data.length > 0) return search.data[0];
  } catch (e) {
    // Search can return 400 if no customers ever indexed in test mode; fall through.
    console.warn("[stripeCustomer] search failed, falling back to email:", e);
  }

  // 2) Email fallback (legacy customers, or search lag)
  const byEmail = await stripe.customers.list({ email, limit: 1 });
  if (byEmail.data.length === 0) return null;
  const customer = byEmail.data[0];

  // Backfill metadata so future lookups skip the fallback.
  if (customer.metadata?.supabase_user_id !== userId) {
    try {
      await stripe.customers.update(customer.id, {
        metadata: { ...customer.metadata, supabase_user_id: userId },
      });
    } catch (e) {
      console.warn("[stripeCustomer] metadata backfill failed:", e);
    }
  }
  return customer;
}

export async function findOrCreateStripeCustomer(
  stripe: Stripe,
  userId: string,
  email: string,
): Promise<Stripe.Customer> {
  const existing = await findStripeCustomer(stripe, userId, email);
  if (existing) return existing;
  return await stripe.customers.create({
    email,
    metadata: { supabase_user_id: userId },
  });
}
