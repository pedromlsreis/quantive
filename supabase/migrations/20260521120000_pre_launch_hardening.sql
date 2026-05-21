-- Pre-launch hardening (2026-05-21, T-5 to HN launch).
--
-- Three things:
--   1. Cache Stripe subscription state on profiles so the per-request
--      check-subscription edge function no longer calls the live Stripe API
--      on every dashboard load. The webhook is the source of truth; the
--      cache survives unless we explicitly invalidate it. check-subscription
--      falls back to a live Stripe lookup only when subscription_synced_at
--      is NULL (a user who pre-dates this migration and has not yet had a
--      webhook fire).
--
--   2. stripe_events table for webhook idempotency. Stripe retries on any
--      non-2xx response and occasionally re-delivers; the INSERT-ON-CONFLICT
--      pattern gives us exactly-once handler execution.
--
--   3. welcome_email_sent_at so the send-welcome-email function can be called
--      from the client on every sign-in without duplicating the email.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS stripe_customer_id text,
  ADD COLUMN IF NOT EXISTS subscription_status text,
  ADD COLUMN IF NOT EXISTS subscription_product_id text,
  ADD COLUMN IF NOT EXISTS subscription_end timestamptz,
  ADD COLUMN IF NOT EXISTS subscription_cancel_at_period_end boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS subscription_synced_at timestamptz,
  ADD COLUMN IF NOT EXISTS welcome_email_sent_at timestamptz;

-- A single Stripe customer maps to a single Supabase user. The unique index
-- enforces that and gives us O(1) lookups from webhook payloads.
CREATE UNIQUE INDEX IF NOT EXISTS profiles_stripe_customer_id_key
  ON public.profiles (stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.stripe_events (
  event_id text PRIMARY KEY,
  event_type text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.stripe_events ENABLE ROW LEVEL SECURITY;
-- No policies on purpose: only the service role (webhook handler) writes
-- here. Authenticated and anon clients have no business reading the event
-- log, so omitting policies denies them implicitly.
