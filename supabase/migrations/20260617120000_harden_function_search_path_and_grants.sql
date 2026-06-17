-- ===========================================================================
-- Security-advisor hardening: pin search_path on SECURITY DEFINER / invoker
-- helpers, and stop the Data API from exposing functions that were only ever
-- meant for triggers or service_role edge calls.
--
-- Addresses Supabase linter findings:
--   0011 function_search_path_mutable
--   0028 anon_security_definer_function_executable
--   0029 authenticated_security_definer_function_executable
--
-- Note on the REVOKEs: Postgres grants EXECUTE to PUBLIC by default, and
-- anon/authenticated/service_role all inherit it. Revoking from a single role
-- is a no-op while the PUBLIC grant stands, so we revoke from PUBLIC and
-- re-grant only to the roles that actually call each function.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Pin search_path (0011). ALTER avoids recreating the bodies.
--    has_role / is_admin / handle_new_user already set it at definition.
-- ---------------------------------------------------------------------------
alter function public.convert_at(numeric, text, text, date)        set search_path = public;
alter function public.check_rate_limit(text, integer, integer)     set search_path = public;
alter function public.check_rate_limit_bucket(text, text, integer, integer) set search_path = public;
alter function public.prevent_last_admin_removal()                 set search_path = public;

-- ---------------------------------------------------------------------------
-- 2. Rate-limit functions (0028/0029): edge-function-only. Exposed as RPC,
--    any caller could inflate or poison the per-IP counter. Only service_role
--    (used inside edge functions) needs EXECUTE.
-- ---------------------------------------------------------------------------
revoke execute on function public.check_rate_limit(text, integer, integer)            from public, anon, authenticated;
revoke execute on function public.check_rate_limit_bucket(text, text, integer, integer) from public, anon, authenticated;
grant  execute on function public.check_rate_limit(text, integer, integer)            to service_role;
grant  execute on function public.check_rate_limit_bucket(text, text, integer, integer) to service_role;

-- ---------------------------------------------------------------------------
-- 3. handle_new_user (0028/0029): an AFTER INSERT trigger on auth.users.
--    Triggers fire without an EXECUTE-privilege check on the caller, so
--    nothing legitimate needs RPC access. Remove it from the API entirely.
-- ---------------------------------------------------------------------------
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. has_role / is_admin (0028): the documented role-check pattern. RLS
--    policies on user_roles call these, and policy expressions run with the
--    *querying* role's privileges, so `authenticated` MUST keep EXECUTE or
--    admin reads break. anon never has roles and the policies are TO
--    authenticated only, so drop anon's access (clears the 0028 finding;
--    the 0029 finding on these two is expected and required).
-- ---------------------------------------------------------------------------
revoke execute on function public.has_role(uuid, public.app_role) from public, anon;
revoke execute on function public.is_admin(uuid)                  from public, anon;
grant  execute on function public.has_role(uuid, public.app_role) to authenticated, service_role;
grant  execute on function public.is_admin(uuid)                  to authenticated, service_role;
