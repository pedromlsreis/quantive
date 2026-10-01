-- Family plan, phase 3: the paid Family plan grants what family_beta did.
-- Spec: docs/security/encryption.md §7.3.
--
-- profiles.subscription_plan names the plan of the cached subscription
-- ('pro' or 'family'). The Stripe webhook and check-subscription's live
-- fallback write it from the product id (supabase/functions/_shared/
-- billingPlans.ts), so no Stripe id appears in SQL.

alter table public.profiles
  add column subscription_plan text check (subscription_plan in ('pro', 'family')),
  -- Like pro_welcome_sent_at: a Pro subscriber who switches to Family has
  -- already used that one.
  add column family_welcome_sent_at timestamptz;

-- Only Pro was sold before this migration.
update public.profiles set subscription_plan = 'pro' where subscription_product_id is not null;

-- New profiles columns are service-role-only for UPDATE: 20260521130000
-- grants UPDATE column by column. INSERT is still table-wide, and a client
-- never inserts a profile (handle_new_user does), so take it away now that
-- a profile row grants Family server-side.
revoke insert on public.profiles from authenticated;

-- Family through the beta list or an entitled Family subscription. The
-- statuses match check-subscription's (past_due keeps access while Stripe
-- retries the card).
create or replace function public.has_family(_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.family_beta where user_id = _user_id)
      or exists (
        select 1 from public.profiles
        where user_id = _user_id
          and subscription_plan = 'family'
          and subscription_status in ('active', 'trialing', 'past_due')
      );
$$;

revoke execute on function public.has_family(uuid) from public, anon, authenticated;
grant execute on function public.has_family(uuid) to service_role;
