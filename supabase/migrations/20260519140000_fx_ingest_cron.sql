-- ===========================================================================
-- fx-ingest scheduled cron — version-controlled mirror of the existing
-- dashboard-configured cron job. Brought into a migration so a fresh
-- environment rebuild gets the schedule automatically.
--
-- Schedule:  0 17 * * 1-5 (17:00 UTC, Mon–Fri) — same expression as the
--            benchmark-ingest cron added in 20260519130000_benchmark_ingest_cron.sql.
--
-- Reads CRON_SECRET from Vault under the name 'cron_secret' (same secret used
-- by benchmark-ingest). cron.schedule(jobname, ...) is upsert-by-name, so
-- re-applying this migration updates the schedule rather than creating
-- duplicates.
--
-- ─── IMPORTANT one-time action when applying this on the EXISTING project ──
--
-- The fx-ingest cron is currently configured via the Supabase dashboard UI.
-- If you apply this migration on a project that already has the UI-scheduled
-- job, you will end up with TWO concurrent schedules firing the same function
-- (the UI job and 'fx-ingest-daily' here). Delete the UI-scheduled job from
-- the dashboard immediately after `supabase db push` finishes, or rename
-- 'fx-ingest-daily' below to match the UI job's exact name so cron.schedule
-- overwrites it in place.
--
-- ───────────────────────────────────────────────────────────────────────────

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

select cron.schedule(
  'fx-ingest-daily',
  '0 17 * * 1-5',
  $$
  select net.http_post(
    url := 'https://zopuheksdstvptorphck.supabase.co/functions/v1/fx-ingest',
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
    -- Override pg_net's 5s default: on timeout it drops the connection and the
    -- write is lost.
    timeout_milliseconds := 60000
  );
  $$
);
