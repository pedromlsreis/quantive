-- Per-user flag for the Pro welcome email so Stripe webhook retries (and
-- churn-and-return events) do not re-send "Welcome to Quantive Pro".
--
-- The existing welcome_email_sent_at covers the general account-confirmation
-- welcome and is unrelated; we need a separate flag so a Pro upgrade can
-- send its own one-shot welcome even if the user has already received the
-- account welcome years earlier.
--
-- Like the other subscription cache columns this is service-role-only: the
-- column-grant lockdown from 20260521130000_lock_profiles_subscription_columns.sql
-- enumerates the user-writeable columns (display_name, preferred_currency),
-- so adding a new column here is automatically excluded from client writes.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS pro_welcome_sent_at timestamptz;
