-- Lock down the subscription cache columns on public.profiles so that the
-- only writer is the Stripe webhook (which uses service_role and bypasses
-- both RLS and column grants).
--
-- Background: 20260302091120 created the UPDATE policy
--   USING (auth.uid() = user_id)
-- without a WITH CHECK or column restriction, and 20260514000000 granted
--   UPDATE on public.profiles to authenticated
-- column-wide. 20260521120000 then added the subscription cache columns,
-- which by transitive grant became client-writeable. An authenticated user
-- could `update profiles set subscription_status='active', …` and the
-- check-subscription cache would happily report Pro entitlement until the
-- next webhook overwrote it.
--
-- Fix: replace the column-wide UPDATE grant with a column-list grant that
-- enumerates exactly the two fields a user legitimately edits from the
-- client: display_name and preferred_currency. Everything else on the
-- profile row stays service-role-only.
--
-- This is RLS-orthogonal: the existing row-level UPDATE policy still
-- applies on top of the column grant, so a user still cannot UPDATE
-- another user's display_name even though the column is grantable.

REVOKE UPDATE ON public.profiles FROM authenticated;

GRANT UPDATE (display_name, preferred_currency)
  ON public.profiles
  TO authenticated;
