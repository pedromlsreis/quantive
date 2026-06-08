-- ===========================================================================
-- ingest-healthcheck scheduled cron — dead-man's switch for reference data.
--
-- Runs daily at 18:00 UTC, one hour after the fx-ingest / benchmark-ingest
-- crons (0 17 * * 1-5), so it inspects the result of the day's ingest. Fires
-- every day (incl. weekends): the daily-series thresholds (4 days) tolerate a
-- normal Fri→Mon market-closed gap, so a healthy weekend stays silent.
--
-- The function reads the latest date present in each ingested dataset and
-- emails the founder only if something is stale — silence means healthy. This
-- exists because cron success is NOT a freshness signal: pg_net can enqueue a
-- POST successfully while every write the function attempts fails (the 5s
-- timeout that froze SP500 for a week). See ingest-healthcheck/index.ts.
--
-- Authorization reads the shared CRON_SECRET from Vault under 'cron_secret' —
-- the same secret used by fx-ingest, benchmark-ingest, and entry-reminders.
-- See 20260519130000_benchmark_ingest_cron.sql for the one-time
-- vault.create_secret setup.
--
-- The alert recipient is ALERT_TO_EMAIL (falls back to FEEDBACK_TO_EMAIL, then
-- hello@usequantive.app). Set it alongside the function's other secrets.
--
-- cron.schedule(jobname, ...) is upsert-by-name, so re-applying this migration
-- updates the schedule rather than creating duplicates.
-- ===========================================================================

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

select cron.schedule(
  'ingest-healthcheck-daily',
  '0 18 * * *',
  $$
  select net.http_post(
    url := 'https://zopuheksdstvptorphck.supabase.co/functions/v1/ingest-healthcheck',
    headers := jsonb_build_object(
      'Authorization',
        'Bearer ' || (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'cron_secret'
          limit 1
        ),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb,
    -- One small SELECT per dataset + at most one email. Generous headroom so a
    -- slow Resend call never trips pg_net's default 5s and silences the very
    -- alert that is supposed to fire.
    timeout_milliseconds := 30000
  );
  $$
);
