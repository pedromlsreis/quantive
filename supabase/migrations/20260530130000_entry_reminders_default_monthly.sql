-- ===========================================================================
-- Entry reminders: make the cadence monthly-by-default and NOT NULL.
--
-- Follow-up to 20260530120000_entry_reminders.sql, which added
-- reminder_frequency as a nullable column (NULL = disabled). We are moving to
-- "monthly is the baseline for everyone": backfill any NULL rows to 'monthly',
-- set the column default, and enforce NOT NULL so there is no NULL state left
-- to reason about downstream. 'off' remains the explicit way to disable the
-- nudge.
-- ===========================================================================

-- Migrate every existing row (any NULLs left by the previous migration) to
-- a monthly nudge.
UPDATE public.profiles
  SET reminder_frequency = 'monthly'
  WHERE reminder_frequency IS NULL;

-- New signups default to monthly; handle_new_user() inserts the profile row
-- without naming this column, so it inherits the default.
ALTER TABLE public.profiles
  ALTER COLUMN reminder_frequency SET DEFAULT 'monthly';
ALTER TABLE public.profiles
  ALTER COLUMN reminder_frequency SET NOT NULL;

-- Tighten the CHECK now that NULL is no longer a valid state.
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_reminder_frequency_chk;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_reminder_frequency_chk
    CHECK (reminder_frequency IN ('off', 'monthly', 'quarterly', 'biannual'));

COMMENT ON COLUMN public.profiles.reminder_frequency IS
  'Entry-reminder cadence. NOT NULL, defaults to ''monthly''. One of off, monthly, quarterly, biannual; ''off'' disables the nudge.';
