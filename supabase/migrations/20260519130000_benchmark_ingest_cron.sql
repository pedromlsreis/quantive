-- ===========================================================================
-- benchmark-ingest scheduled cron.
--
-- Mirrors fx-ingest's cadence (0 17 * * 1-5 — 17:00 UTC, Mon–Fri).
--
-- The Authorization header reads the shared CRON_SECRET from Vault under the
-- name 'cron_secret'. Create it ONCE per environment (idempotent — re-running
-- vault.create_secret with the same name raises an error, so guard or skip if
-- already present):
--
--   select vault.create_secret('<paste-CRON_SECRET-value-here>', 'cron_secret');
--
-- Use the same secret value you set via `supabase secrets set CRON_SECRET=...`
-- so the edge function and the scheduler agree.
--
-- cron.schedule(jobname, ...) is upsert-by-name, so re-applying this migration
-- updates the schedule rather than creating duplicates.
-- ===========================================================================

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

select cron.schedule(
  'benchmark-ingest-daily',
  '0 17 * * 1-5',
  $$
  select net.http_post(
    url := 'https://zopuheksdstvptorphck.supabase.co/functions/v1/benchmark-ingest',
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
    -- pg_net defaults to a 5s client-side timeout. The function fetches an
    -- upstream series and chunk-upserts before responding, which can exceed
    -- 5s; when pg_net gives up it drops the connection and the function is
    -- killed mid-write, so nothing lands and the series silently freezes.
    -- 60s leaves ample headroom even on a slow upstream day.
    timeout_milliseconds := 60000
  );
  $$
);
