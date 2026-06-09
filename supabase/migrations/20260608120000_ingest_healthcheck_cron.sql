-- ===========================================================================
-- ingest-healthcheck scheduled cron — dead-man's switch for reference data.
--
-- Runs daily at 18:00 UTC, an hour after the ingest crons, and emails the
-- founder if any dataset is stale (see ingest-healthcheck/index.ts).
--
-- Auth reads the shared CRON_SECRET from Vault under 'cron_secret' (see
-- 20260519130000_benchmark_ingest_cron.sql for the one-time setup). Alert
-- recipient: ALERT_TO_EMAIL → FEEDBACK_TO_EMAIL → hello@usequantive.app.
--
-- cron.schedule(jobname, ...) is upsert-by-name, so re-applying just updates.
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
    -- Override pg_net's 5s default so a slow Resend call can't silence the alert.
    timeout_milliseconds := 30000
  );
  $$
);
