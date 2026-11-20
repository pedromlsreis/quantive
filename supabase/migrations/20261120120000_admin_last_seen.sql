-- When each user last used the app, for the admin dashboard's "Last seen" and
-- active-user counts.
--
-- auth.users.last_sign_in_at moves only when GoTrue opens a new session. A
-- returning user whose session persisted skips sign-in: the app refreshes the
-- token and the unlock screen derives the key in the browser. GoTrue stamps
-- auth.sessions.refreshed_at on every refresh, so the later of the two is
-- the last visit, give or take the access token's lifetime.
--
-- refreshed_at is `timestamp without time zone` holding UTC (GoTrue migration
-- 20231027141322), hence AT TIME ZONE 'UTC'. Signing out deletes the session
-- rows, but the next visit then needs a sign-in, which moves last_sign_in_at.
--
-- Returns one jsonb object {user_id: last_seen_at} rather than a row set:
-- PostgREST caps RPC row sets at db-max-rows (1000 by default) and would cut
-- the list silently. Users who never signed in are absent.

CREATE FUNCTION public.admin_last_seen()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce(jsonb_object_agg(u.id, seen.at), '{}'::jsonb)
  FROM auth.users u
  CROSS JOIN LATERAL (
    SELECT greatest(u.last_sign_in_at, max(s.refreshed_at AT TIME ZONE 'UTC')) AS at
    FROM auth.sessions s
    WHERE s.user_id = u.id
  ) seen
  WHERE seen.at IS NOT NULL;
$$;

-- Reads every user's auth metadata, so only the admin edge functions
-- (service_role) may call it. Revoking from PUBLIC matters: anon and
-- authenticated inherit its default EXECUTE grant.
REVOKE EXECUTE ON FUNCTION public.admin_last_seen() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_last_seen() TO service_role;
