-- ===========================================================================
-- benchmarks: daily/monthly reference series for portfolio comparison.
--
-- Design (decided 2026-05-19):
--   * One row per (series_id, date). Multiple series share the table.
--     v1 series: 'inflation_eu' (Eurostat HICP, monthly index, currency-null)
--                'sp500'        (FRED SP500, daily index, USD)
--     v1.1:      'msci_world'   (deferred — no free official series exists)
--   * Index values are stored as published — rebasing to 100-at-period-start
--     happens client-side at display time so the period selector can recompute
--     without a round-trip.
--   * `currency` is null for unit-less index series like HICP, and set for
--     fiat-denominated indices like SP500 ('USD'). Display-time disclosure
--     handles currency drift; we never FX-adjust the index itself.
--   * Granularity is whatever the upstream publishes. We do not interpolate.
--     Stale-data UX handles publication gaps on the client.
--   * Reference data, not per-user. Public read so unauthenticated visitors
--     on /performance see the chart shell; only service_role writes (via the
--     benchmark-ingest Edge Function).
-- ===========================================================================

create table public.benchmarks (
  series_id     text          not null,
  date          date          not null,
  value         numeric       not null,
  currency      text,
  source        text          not null,
  ingested_at   timestamptz   not null default now(),
  primary key (series_id, date)
);

comment on table  public.benchmarks is
  'Reference benchmark series (inflation, equity indices). One row per (series_id, date). Public read; service_role write via benchmark-ingest.';
comment on column public.benchmarks.value is
  'Index value as published by upstream. Rebasing to 100 happens client-side at display time.';
comment on column public.benchmarks.currency is
  'ISO currency code if the series is fiat-denominated (e.g. SP500=USD), else NULL for unit-less indices like HICP.';
comment on column public.benchmarks.source is
  'Upstream source identifier (e.g. eurostat, fred). For audit and provenance.';

-- "Full series for series X" and "latest row for series X" are the dominant
-- access patterns. (series_id, date desc) covers both.
create index benchmarks_series_date_idx
  on public.benchmarks (series_id, date desc);

-- Reference data is public, non-PII. Anyone can read; only service_role writes.
alter table public.benchmarks enable row level security;

create policy "benchmarks readable by anon and authenticated"
  on public.benchmarks for select
  to anon, authenticated
  using (true);

-- Explicit Data API grants (mirrors fx_rates / data_api_grants convention).
grant select on public.benchmarks to anon, authenticated;
grant all    on public.benchmarks to service_role;
