-- ===========================================================================
-- entry-reminders scheduled cron.
--
-- Runs once a day at 09:00 UTC. The edge function itself decides who is due
-- (cadence elapsed since their last sync, throttled by reminder_last_sent_at),
-- so a daily tick is the natural granularity: a monthly user becomes due on
-- whichever day crosses the 30-day mark, and the function picks them up then.
--
-- Authorization reads the shared CRON_SECRET from Vault under 'cron_secret' —
-- the same secret used by fx-ingest and benchmark-ingest. See
-- 20260519130000_benchmark_ingest_cron.sql for the one-time
-- vault.create_secret setup.
--
-- cron.schedule(jobname, ...) is upsert-by-name, so re-applying this migration
-- updates the schedule rather than creating duplicates.
-- ===========================================================================

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

select cron.schedule(
  'entry-reminders-daily',
  '0 9 * * *',
  $$
  select net.http_post(
    url := 'https://zopuheksdstvptorphck.supabase.co/functions/v1/entry-reminders',
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
    -- pg_net defaults to a 5s client-side timeout; if the function takes
    -- longer to respond, pg_net drops the connection and the run is lost.
    -- entry-reminders iterates due users and sends email, so it is the most
    -- likely of the three crons to exceed 5s. 60s leaves ample headroom.
    timeout_milliseconds := 60000
  );
  $$
);
