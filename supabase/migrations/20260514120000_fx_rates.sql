-- ===========================================================================
-- fx_rates: daily FX reference rates for multi-currency conversions.
--
-- Design (decided 2026-05-14):
--   * Base-anchored, not pairwise. One row per (date, foreign-currency).
--         rate_to_base = units of BASE per 1 unit of `currency`
--         amount_in_base   = amount_in_currency * rate_to_base
--         amount_in_target = amount_in_currency
--                            * rate_to_base[currency] / rate_to_base[target]
--     Avoids O(n²) growth, inconsistent cross-rates, arbitrage loops and
--     precision drift across hops.
--   * Base is EUR, fixed forever. Chosen because ECB reference rates (which
--     we ingest via Frankfurter) are natively EUR-quoted. The user's display
--     currency is independent — base is an internal detail.
--   * Granularity is daily close (ECB publishes ~16:00 CET on TARGET2 days).
--   * EUR itself has no row — by definition rate_to_base[EUR] = 1.
-- ===========================================================================

create table public.fx_rates (
  date          date          not null,
  currency      text          not null,
  rate_to_base  numeric(18, 8) not null check (rate_to_base > 0),
  created_at    timestamptz   not null default now(),
  primary key (date, currency)
);

comment on table  public.fx_rates is
  'Daily FX reference rates. Base = EUR (fixed). rate_to_base = EUR per 1 unit of currency.';
comment on column public.fx_rates.rate_to_base is
  'EUR per 1 unit of `currency`. amount_eur = amount * rate_to_base.';

-- "Latest rate for currency X" is the dominant access pattern.
create index fx_rates_currency_date_idx
  on public.fx_rates (currency, date desc);

-- Reference data, not per-user. Authenticated users read; only the fx-ingest
-- Edge Function (service_role) writes. service_role bypasses RLS by design.
alter table public.fx_rates enable row level security;

create policy "fx_rates readable by authenticated"
  on public.fx_rates for select
  to authenticated
  using (true);

-- Explicit Data API grants (per 20260514000000_data_api_grants.sql convention).
grant select on public.fx_rates to authenticated;
grant all    on public.fx_rates to service_role;

-- ===========================================================================
-- convert_at(amount, from_ccy, target_ccy, as_of)
--
-- Single source of truth for FX conversion. Enforces the "latest rate on or
-- before as_of" lookup so callers cannot accidentally value a Saturday
-- snapshot against today's rate.
--
-- Semantics:
--   * Returns the amount converted from `from_ccy` to `target_ccy` using the
--     rates valid on `as_of` (or the closest prior business day).
--   * EUR is the base and has no row in fx_rates — handled inline.
--   * Returns NULL if either currency has no rate on or before `as_of`
--     (e.g. querying a date before ingestion began). NULL propagates through
--     SUM/AVG, surfacing missing data instead of silently producing a wrong
--     total at today's rate.
--   * `strict` short-circuits to NULL if any argument is NULL.
--   * `stable` — same inputs return the same result within a single query;
--     between queries fx_rates can grow.
-- ===========================================================================
create or replace function public.convert_at(
  amount     numeric,
  from_ccy   text,
  target_ccy text,
  as_of      date
) returns numeric
language sql
stable
strict
as $$
  select case
    when from_ccy = target_ccy then amount
    else amount
         * case when from_ccy = 'EUR' then 1::numeric
                else (select rate_to_base
                      from public.fx_rates
                      where currency = from_ccy and date <= as_of
                      order by date desc
                      limit 1) end
         / case when target_ccy = 'EUR' then 1::numeric
                else (select rate_to_base
                      from public.fx_rates
                      where currency = target_ccy and date <= as_of
                      order by date desc
                      limit 1) end
  end;
$$;

comment on function public.convert_at(numeric, text, text, date) is
  'Convert amount from from_ccy to target_ccy using fx_rates as of as_of (latest <= as_of). Returns NULL if rates are unavailable.';

-- Lock down RPC exposure: anon cannot SELECT fx_rates, so the function would
-- silently return NULL for it — better to refuse the call outright.
revoke execute on function public.convert_at(numeric, text, text, date) from public;
grant  execute on function public.convert_at(numeric, text, text, date) to authenticated, service_role;
