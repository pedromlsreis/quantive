-- ===========================================================================
-- Per-account "hide values when you switch away" preference.
--
-- blur_on_unfocus: when true, monetary values are blurred automatically
--   whenever the window loses focus or the tab is hidden, and revealed on
--   return. Previously device-local (localStorage only), which meant enabling
--   it on one machine left it off on another. Moving it onto the profile lets
--   the setting follow the account across devices, mirroring auto_lock_minutes
--   (20260617130000) and preferred_currency.
--
-- On by default: NOT NULL DEFAULT true — for a privacy-first product the safe
-- default is to hide values when you step away, so new accounts (and existing
-- rows backfilled by the column default) start with it on. A user can still
-- turn it off in Settings.
--
-- Column grants: 20260521130000_lock_profiles_subscription_columns.sql made
-- profiles columns service-role-only unless explicitly granted, so a brand-new
-- column is service-role-only until granted. This is a user preference, so we
-- grant it to authenticated; RLS still scopes the row to auth.uid() = user_id.
-- ===========================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS blur_on_unfocus boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.profiles.blur_on_unfocus IS
  'Auto-blur monetary values when the window loses focus / tab is hidden. Default true (on).';

-- Let authenticated users edit their own preference (RLS still scopes the row
-- to auth.uid() = user_id).
GRANT UPDATE (blur_on_unfocus) ON public.profiles TO authenticated;
