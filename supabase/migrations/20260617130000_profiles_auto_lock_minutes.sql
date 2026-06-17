-- ===========================================================================
-- Per-account idle auto-lock timeout.
--
-- auto_lock_minutes: minutes of inactivity before the workspace auto-locks
--   (the in-memory data key is dropped and the unlock prompt returns).
--   0 = never. Lives on the profile so the setting follows the account across
--   devices, rather than only in device localStorage.
--
-- On by default: NOT NULL DEFAULT 15 — new accounts, and existing rows
-- backfilled by the column default, start with a 15-minute auto-lock. A user
-- can still pick 0 (never) to turn it off.
--
-- Column grants: 20260521130000_lock_profiles_subscription_columns.sql made
-- profiles columns service-role-only unless explicitly granted, so a brand-new
-- column is service-role-only until granted. This is a user preference, so we
-- grant it to authenticated; RLS still scopes the row to auth.uid() = user_id.
-- ===========================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS auto_lock_minutes smallint NOT NULL DEFAULT 15;

COMMENT ON COLUMN public.profiles.auto_lock_minutes IS
  'Minutes of inactivity before the workspace auto-locks. 0 = never. Default 15 (on).';

-- Whitelist the timeout options the UI offers.
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_auto_lock_minutes_chk;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_auto_lock_minutes_chk
    CHECK (auto_lock_minutes IN (0, 5, 15, 30, 60));

-- Let authenticated users edit their own timeout (RLS still scopes the row to
-- auth.uid() = user_id).
GRANT UPDATE (auto_lock_minutes) ON public.profiles TO authenticated;
