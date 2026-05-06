-- Persist user's preferred display currency on the profile.
-- Nullable: a null value means "fall back to the device default (localStorage)".
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS preferred_currency text;
