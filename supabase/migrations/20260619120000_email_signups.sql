-- Email capture for the landing-page "stay in the loop" form.
--
-- Rows are written ONLY by the email-signup Edge Function, which runs as
-- service_role (bypassing RLS), verifies a Cloudflare Turnstile token, and
-- rate-limits per IP before inserting. There is deliberately no anon /
-- authenticated INSERT grant and no INSERT RLS policy, so the public anon key
-- cannot POST straight to /rest/v1/email_signups and skip the Turnstile +
-- rate-limit guard — the same direct-path bypass closed for public.feedback in
-- 20260613120000.

CREATE TABLE IF NOT EXISTS public.email_signups (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email       text NOT NULL,
  source      text NOT NULL DEFAULT 'landing',
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT email_signups_email_unique UNIQUE (email),
  -- Stored lowercased (the function normalises) so UNIQUE dedupes case-
  -- insensitively. The shape check is a backstop behind the function's own
  -- validation, not the primary validator.
  CONSTRAINT email_signups_email_shape CHECK (
    email = lower(email)
    AND char_length(email) <= 254
    AND email ~ '^[^@ ]+@[^@ ]+\.[^@ ]+$'
  ),
  CONSTRAINT email_signups_source_len CHECK (char_length(source) <= 40)
);

ALTER TABLE public.email_signups ENABLE ROW LEVEL SECURITY;

-- Explicit deny-all for the public API roles. RLS-on-with-no-policy already
-- denies, but an explicit policy documents the intent AND keeps the Supabase
-- security advisor's "RLS enabled, no policy" notice from firing. service_role
-- bypasses RLS, so the email-signup Edge Function is unaffected. Admin reads go
-- through service_role tooling (dashboard / SQL), not the data API.
CREATE POLICY "No public access to email_signups"
  ON public.email_signups
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

-- Belt-and-braces against any blanket grant from data_api_grants
-- (20260514000000): the public API roles must hold no direct DML here.
REVOKE ALL ON public.email_signups FROM anon;
REVOKE ALL ON public.email_signups FROM authenticated;
