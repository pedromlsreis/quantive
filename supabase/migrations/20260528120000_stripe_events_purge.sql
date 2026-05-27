-- ===========================================================================
-- stripe_events 90-day retention.
--
-- The table exists solely for webhook idempotency (INSERT ... ON CONFLICT
-- DO NOTHING on event_id). Stripe stops retrying after a few days, so any
-- row older than that is dead weight — keep 90 days as a comfortable forensic
-- window for investigating a delivery anomaly, then prune.
--
-- Runs at 03:10 UTC daily — late enough that traffic is low, offset 10 min
-- from any other "0 3 * * *" jobs so they don't fight for the worker.
--
-- cron.schedule(jobname, ...) is upsert-by-name, so re-applying this migration
-- updates the schedule rather than creating duplicates.
-- ===========================================================================

create extension if not exists pg_cron with schema extensions;

select cron.schedule(
  'stripe-events-purge-daily',
  '10 3 * * *',
  $$
  delete from public.stripe_events
  where received_at < now() - interval '90 days'
  $$
);
