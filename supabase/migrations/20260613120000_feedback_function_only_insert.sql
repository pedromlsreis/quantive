-- Close the direct-to-PostgREST insert path on public.feedback.
--
-- All feedback is meant to flow through the submit-feedback Edge Function,
-- which runs as service_role (bypassing RLS + grants) and enforces a 2/minute
-- per-IP cap (functions/submit-feedback/index.ts). But feedback also had a
-- *second*, unthrottled path: an INSERT grant to anon/authenticated plus the
-- "Anyone can submit feedback" RLS policy (see 20260303082702 and the
-- speculative anon grant in 20260514000000). That let anyone holding the
-- public anon key POST straight to /rest/v1/feedback and skip the limiter
-- entirely — feedback spam with no throttle.
--
-- The client only ever calls supabase.functions.invoke('submit-feedback')
-- (src/components/dashboard/FeedbackButton.tsx) and never inserts into the
-- table directly, so removing the direct path is transparent to the app.
--
-- Kept intact:
--   * service_role ALL          — the Edge Function's path, still the only way in
--   * authenticated SELECT      — the "view own feedback" read policy
-- Removed:
--   * the "Anyone can submit feedback" INSERT policy
--   * INSERT grants to anon and authenticated

-- Knowledge preserved for whoever may one day build a *throttled* direct path
-- (e.g. unauthenticated demo visitors submitting feedback without the function).
-- The dropped policy encoded this row-level rule — recreate it alongside a
-- rate-limited grant, never a bare grant, or you reopen the unthrottled bypass:
--
--   CREATE POLICY "Anyone can submit feedback"
--   ON public.feedback
--   FOR INSERT
--   TO anon, authenticated
--   WITH CHECK (
--     (auth.uid() IS NULL AND user_id IS NULL)   -- anon may only insert its own anon row
--     OR (auth.uid() = user_id)                  -- a user may only insert rows as themselves
--   );
--
-- Original definition: migration 20260303082702. Speculative anon INSERT grant:
-- migration 20260514000000 (data_api_grants), whose comment is now stale.

DROP POLICY IF EXISTS "Anyone can submit feedback" ON public.feedback;

REVOKE INSERT ON public.feedback FROM anon;
REVOKE INSERT ON public.feedback FROM authenticated;
