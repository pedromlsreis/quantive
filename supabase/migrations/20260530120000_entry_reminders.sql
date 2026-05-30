-- ===========================================================================
-- Recurring entry reminders.
--
-- Two new columns on public.profiles drive an optional email nudge that
-- prompts a user to update their balances on a cadence they choose:
--
--   reminder_frequency    user-chosen cadence. NULL or 'off' = disabled.
--                         Allowed: 'monthly', 'quarterly', 'biannual'.
--   reminder_last_sent_at last time the entry-reminders cron emailed this
--                         user. Used to throttle so a still-inactive user is
--                         nagged at most once per interval, not daily.
--
-- Privacy: the cron decides who to email purely from reminder_frequency and
-- portfolio_snapshots.updated_at (the last sync time, which the server already
-- knows). It never touches encrypted_data. No portfolio plaintext is involved.
--
-- Column grants: 20260521130000_lock_profiles_subscription_columns.sql replaced
-- the column-wide UPDATE grant with an enumerated list, so a brand-new column
-- is service-role-only until explicitly granted. reminder_frequency is a user
-- preference, so we grant it to authenticated. reminder_last_sent_at is written
-- only by the cron (service_role), so it is deliberately NOT granted.
-- ===========================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS reminder_frequency    text,
  ADD COLUMN IF NOT EXISTS reminder_last_sent_at timestamptz;

COMMENT ON COLUMN public.profiles.reminder_frequency IS
  'User-chosen entry-reminder cadence. NULL/''off'' = disabled. One of monthly, quarterly, biannual.';
COMMENT ON COLUMN public.profiles.reminder_last_sent_at IS
  'Last time the entry-reminders cron emailed this user. Service-role-only; throttles repeat nudges.';

-- Whitelist the allowed cadences. NULL stays valid (disabled by default).
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_reminder_frequency_chk;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_reminder_frequency_chk
    CHECK (reminder_frequency IS NULL
           OR reminder_frequency IN ('off', 'monthly', 'quarterly', 'biannual'));

-- Let authenticated users edit their own cadence (RLS still scopes the row to
-- auth.uid() = user_id). reminder_last_sent_at is intentionally omitted.
GRANT UPDATE (reminder_frequency) ON public.profiles TO authenticated;
