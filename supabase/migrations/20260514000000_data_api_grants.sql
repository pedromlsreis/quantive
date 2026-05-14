-- ===========================================================================
-- Explicit Data API grants for all public tables.
--
-- Supabase is removing the default "expose public schema to Data API" behaviour:
--   - 2026-05-30: new projects no longer auto-grant on tables in public.
--   - 2026-10-30: enforced on all existing projects.
-- Source: Supabase email of 2026-05-14.
--
-- Existing tables in this project keep their current grants until the Oct 30
-- cutoff. This migration makes the grants explicit so the cutoff is a no-op
-- and so the intent is reviewable in source.
--
-- Grants are derived from each table's RLS policies + actual call sites in
-- src/ and supabase/functions/. RLS still gates row visibility; grants gate
-- whether the role can address the table via PostgREST/GraphQL at all.
--
-- service_role is granted ALL on every table — it bypasses RLS by design and
-- is only used inside Edge Functions.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- profiles
--   Per-user RLS: select/insert/update for own row. No DELETE policy.
--   Client upserts in SettingsPage / reads in CurrencyContext, AppShell, etc.
-- ---------------------------------------------------------------------------
grant select, insert, update on public.profiles to authenticated;
grant all                    on public.profiles to service_role;

-- ---------------------------------------------------------------------------
-- portfolio_snapshots
--   Per-user RLS: full CRUD for own rows.
--   Client uses select/insert/update/delete (PortfolioContext, cloudSync,
--   supabaseStore).
-- ---------------------------------------------------------------------------
grant select, insert, update, delete on public.portfolio_snapshots to authenticated;
grant all                            on public.portfolio_snapshots to service_role;

-- ---------------------------------------------------------------------------
-- feedback
--   Inserts today go through the submit-feedback Edge Function (service_role,
--   verify_jwt=false). The "Anyone can submit feedback" RLS policy already
--   targets anon — grant matching INSERT so a future direct-from-client path
--   for unauthenticated demo visitors keeps working without a 42501.
--   Authenticated users can read their own feedback rows per RLS.
-- ---------------------------------------------------------------------------
grant insert         on public.feedback to anon;
grant select, insert on public.feedback to authenticated;
grant all            on public.feedback to service_role;

-- ---------------------------------------------------------------------------
-- user_keys
--   Per-user RLS: select/insert/update for own row. DELETE intentionally
--   not exposed — account deletion cascades via FK from auth.users.
-- ---------------------------------------------------------------------------
grant select, insert, update on public.user_keys to authenticated;
grant all                    on public.user_keys to service_role;

-- ---------------------------------------------------------------------------
-- user_roles
--   Admin-gated via is_admin(): authenticated may SELECT (own row + all if
--   admin), INSERT and DELETE (admins only). No UPDATE policy → no UPDATE
--   grant.
-- ---------------------------------------------------------------------------
grant select, insert, delete on public.user_roles to authenticated;
grant all                    on public.user_roles to service_role;

-- ---------------------------------------------------------------------------
-- rate_limits
--   Touched only through the check_rate_limit() SECURITY DEFINER function
--   from inside Edge Functions. Never addressed via the Data API. No client
--   grants required; RLS has no policies so even with grants it would be
--   unreadable from the API.
-- ---------------------------------------------------------------------------
-- (intentionally no grants)
