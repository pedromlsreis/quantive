-- Double opt-in, unsubscribe and a consent record for the landing-page
-- "Keep me posted" list.
--
-- A signup is only a request until its owner confirms it. email-signup stores
-- the SHA-256 of a one-time token and emails the token as a link; email-list
-- confirms it. Updates go only to rows with confirmed_at set.
--
-- unsubscribe_token is stored as is, unlike the confirm token: every update
-- email has to carry it in its unsubscribe link, and all it can do is delete
-- its own row.
--
-- Unsubscribing deletes the signup row, so email_consent_events keeps the proof
-- of consent a sender must produce for emails already sent (§ 7 UWG, Art. 7(1)
-- DSGVO): a keyed hash of the address, never the address, plus what happened and
-- when. A confirmed signup row carries the same hash, which is how the purge
-- tells an address that is still subscribed from one that is gone.
--
-- Rows from before this migration never received a confirmation email. They are
-- never sent updates, and the purge deletes them 7 days after signup like any
-- other unconfirmed request.

ALTER TABLE public.email_signups
  ADD COLUMN confirmed_at timestamptz,
  ADD COLUMN confirm_token_hash text UNIQUE,
  ADD COLUMN confirm_sent_at timestamptz,
  ADD COLUMN confirm_send_count integer NOT NULL DEFAULT 0,
  -- The confirmation email the current link went out in; confirming copies it
  -- into the consent record.
  ADD COLUMN confirm_email_version text,
  -- Set on confirm: this address's key in email_consent_events.
  ADD COLUMN email_hmac text,
  ADD COLUMN unsubscribe_token uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE;

CREATE TABLE IF NOT EXISTS public.email_consent_events (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email_hmac      text NOT NULL,
  event           text NOT NULL,
  occurred_at     timestamptz NOT NULL DEFAULT now(),
  -- Set on 'confirmed': when the request was made and its confirmation email sent,
  -- and which version of that email the address received.
  signed_up_at    timestamptz,
  confirm_sent_at timestamptz,
  email_version   text,
  CONSTRAINT email_consent_events_event CHECK (event IN ('confirmed', 'unsubscribed'))
);

CREATE INDEX IF NOT EXISTS email_consent_events_hmac_occurred
  ON public.email_consent_events (email_hmac, occurred_at);

ALTER TABLE public.email_consent_events ENABLE ROW LEVEL SECURITY;

-- Same posture as email_signups: written and read only through service_role.
CREATE POLICY "No public access to email_consent_events"
  ON public.email_consent_events
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

REVOKE ALL ON public.email_consent_events FROM anon;
REVOKE ALL ON public.email_consent_events FROM authenticated;

-- The edge functions reach both tables as service_role. New tables stop
-- auto-granting at Supabase's 2026-10-30 cutoff (see 20260514000000), and
-- email_signups never had an explicit grant, so grant both here.
GRANT ALL ON public.email_signups        TO service_role;
GRANT ALL ON public.email_consent_events TO service_role;

-- Unsubscribing deletes the row and, for a confirmed address, closes its consent
-- record in the same statement, so neither happens without the other: a lone
-- delete would leave the record looking closed at its old confirmation and let
-- the purge take it years early. The event reuses the hash stored at confirm,
-- so it needs no key and still matches if the key is ever replaced.
CREATE OR REPLACE FUNCTION public.email_list_unsubscribe(p_token uuid)
RETURNS void
LANGUAGE sql
SET search_path = ''
AS $$
  WITH gone AS (
    DELETE FROM public.email_signups
    WHERE unsubscribe_token = p_token
    RETURNING email_hmac
  )
  INSERT INTO public.email_consent_events (email_hmac, event)
  -- Set on confirm, so only a confirmed address has a record to close.
  SELECT email_hmac, 'unsubscribed' FROM gone WHERE email_hmac IS NOT NULL;
$$;

REVOKE EXECUTE ON FUNCTION public.email_list_unsubscribe(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.email_list_unsubscribe(uuid) TO service_role;

-- An unconfirmed signup is deleted 7 days after its last confirmation email, or
-- 7 days after signup when none was sent, as the privacy policy (§7) says.
-- 03:30 UTC, offset from the other nightly jobs. cron.schedule(jobname, ...) is
-- upsert-by-name, so re-applying this migration updates the schedule.
select cron.schedule(
  'email-signups-unconfirmed-purge-daily',
  '30 3 * * *',
  $$
  delete from public.email_signups
  where confirmed_at is null
    and coalesce(confirm_sent_at, created_at) < now() - interval '7 days'
  $$
);

-- A consent record is kept while a confirmed signup row carries its hash, then
-- until the end of the third year after its last event: the limitation period
-- for a claim about an email already sent runs three years from the end of the
-- year it arose (§§ 195, 199 BGB). Keying on the hash rather than on an
-- 'unsubscribed' event means an address that went without one (a failed write,
-- a removal by hand) still expires. 03:40 UTC.
select cron.schedule(
  'email-consent-events-purge-daily',
  '40 3 * * *',
  $$
  delete from public.email_consent_events e
  using (
    select email_hmac
    from public.email_consent_events
    group by email_hmac
    having date_trunc('year', max(occurred_at)) + interval '4 years' <= now()
  ) closed
  where e.email_hmac = closed.email_hmac
    and not exists (
      select 1 from public.email_signups s
      where s.email_hmac = closed.email_hmac and s.confirmed_at is not null
    )
  $$
);
