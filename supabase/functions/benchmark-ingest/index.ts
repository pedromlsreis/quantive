import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import {
  type EurostatJson,
  parseEurostatJson,
  parseFredCsv,
  type Row,
} from "./parsers.ts";

// benchmark-ingest mirrors fx-ingest: a cron-friendly Edge Function that
// fetches the latest values for a small set of official reference series and
// upserts them into public.benchmarks. v1 covers two series:
//   * inflation_eu — Eurostat HICP monthly index (`prc_hicp_midx`, EA, CP00,
//     I15 = 2015=100). Monthly cadence, ~3-week publication lag.
//   * sp500       — FRED daily series SP500 (USD). Daily cadence, ~1 trading
//     day publication lag, ~10-year retention on FRED's free CSV endpoint.
//
// Body shape:
//   {}                                 → incremental top-up: fetch only the
//                                        recent window of each series and
//                                        upsert (idempotent). This is the
//                                        daily-cron path; it keeps runtime
//                                        bounded as the history grows so the
//                                        call comfortably finishes inside the
//                                        scheduler's HTTP timeout.
//   { "full": true }                   → fetch each series' full available
//                                        history. Use ONCE to seed a fresh
//                                        environment (the incremental window
//                                        alone won't populate the 3-year
//                                        chart), or to repair a gap.
//   { "series": "inflation_eu" }       → only that series (combine with full).
//   { "series": "sp500" }              → only that series (combine with full).
//
// All fetches are official-source, no API key required. Failures throw and
// produce a 500 with the error message — visible in Supabase function logs.
//
// The pure parsing logic (Eurostat JSON → Row[], FRED CSV → Row[]) lives in
// `./parsers.ts` so it stays under Vitest coverage. This file holds only the
// Deno-specific fetch + upsert plumbing.

const log = (step: string, details?: unknown) => {
  const d = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[BENCHMARK-INGEST] ${step}${d}`);
};

// ─── Eurostat HICP (inflation_eu) ──────────────────────────────────────────
//
// SDMX 2.1 JSON API. Filter:
//   coicop=CP00 (all items), geo=EA (euro area, all 20 members), unit=I15
//   (index 2015=100, the standard rebase), freq=M (monthly).

const EUROSTAT_URL =
  "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/" +
  "prc_hicp_midx?format=JSON&coicop=CP00&geo=EA&unit=I15&freq=M";

// Incremental window for the monthly HICP series. `lastTimePeriod=N` asks
// Eurostat for only the most recent N periods. 6 months comfortably covers
// the ~3-week publication lag plus any upstream back-revisions to recent
// months. The upsert is idempotent so re-writing the overlap is harmless.
const HICP_RECENT_PERIODS = 6;

async function fetchInflationEu(full: boolean): Promise<Row[]> {
  const url = full ? EUROSTAT_URL : `${EUROSTAT_URL}&lastTimePeriod=${HICP_RECENT_PERIODS}`;
  const resp = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!resp.ok) {
    throw new Error(`Eurostat ${resp.status}: ${await resp.text()}`);
  }
  const json = (await resp.json()) as EurostatJson;
  return parseEurostatJson(json, (reason, ctx) => log(`skipped Eurostat row: ${reason}`, ctx));
}

// ─── FRED SP500 (sp500) ────────────────────────────────────────────────────
//
// FRED's CSV endpoint requires no API key. Format:
//   observation_date,SP500
//   2016-01-04,2012.66
//   ...
//   2026-05-15,5310.12
// Missing values are encoded as "." — parser skips those rows.

const FRED_URL = "https://fred.stlouisfed.org/graph/fredgraph.csv?id=SP500";

// Incremental window for the daily SP500 series. FRED's CSV endpoint accepts
// `cosd` (start date); 14 calendar days covers weekends, US market holidays,
// and a missed run or two. Re-fetching the full ~10-year history every day is
// what pushed the function past the scheduler's HTTP timeout — bounding the
// window keeps each run a few hundred bytes / a handful of rows.
const SP500_RECENT_DAYS = 14;

function isoDaysAgoUtc(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

async function fetchSp500(full: boolean): Promise<Row[]> {
  const url = full ? FRED_URL : `${FRED_URL}&cosd=${isoDaysAgoUtc(SP500_RECENT_DAYS)}`;
  const resp = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!resp.ok) {
    throw new Error(`FRED ${resp.status}: ${await resp.text()}`);
  }
  const text = await resp.text();
  return parseFredCsv(text);
}

// ─── HTTP entry point ──────────────────────────────────────────────────────

type Body = { series?: "inflation_eu" | "sp500"; full?: boolean };

serve(async (req) => {
  try {
    const expected = Deno.env.get("CRON_SECRET");
    if (!expected) throw new Error("CRON_SECRET is not set");
    const auth = req.headers.get("Authorization");
    if (auth !== `Bearer ${expected}`) {
      return new Response("Unauthorized", { status: 401 });
    }

    let body: Body = {};
    const text = await req.text();
    if (text.trim()) {
      try {
        body = JSON.parse(text) as Body;
      } catch {
        throw new Error("Body must be JSON or empty");
      }
    }

    const ALLOWED_SERIES = ["inflation_eu", "sp500"] as const;
    if (body.series && !(ALLOWED_SERIES as readonly string[]).includes(body.series)) {
      return new Response(
        JSON.stringify({ error: `Unknown series "${body.series}". Allowed: ${ALLOWED_SERIES.join(", ")}` }),
        { headers: { "Content-Type": "application/json" }, status: 400 },
      );
    }

    const full = body.full === true;
    const mode = full ? "full" : "incremental";

    const allRows: Row[] = [];
    const fetched: Record<string, number> = {};

    if (!body.series || body.series === "inflation_eu") {
      log("Fetching Eurostat HICP", { mode });
      const rows = await fetchInflationEu(full);
      fetched.inflation_eu = rows.length;
      allRows.push(...rows);
    }
    if (!body.series || body.series === "sp500") {
      log("Fetching FRED SP500", { mode });
      const rows = await fetchSp500(full);
      fetched.sp500 = rows.length;
      allRows.push(...rows);
    }

    log("Fetched rows", fetched);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } },
    );

    // Chunked upsert mirroring fx-ingest. A full SP500 history is ~2.5k rows
    // plus ~400 rows of HICP — well within one PostgREST request, but the
    // chunked path is the safer pattern for any future series we add.
    const CHUNK = 500;
    let written = 0;
    for (let i = 0; i < allRows.length; i += CHUNK) {
      const slice = allRows.slice(i, i + CHUNK);
      const { error } = await admin
        .from("benchmarks")
        .upsert(slice, { onConflict: "series_id,date" });
      if (error) throw error;
      written += slice.length;
    }

    log("Upserted rows", { written, fetched, mode });
    return new Response(
      JSON.stringify({ ok: true, mode, fetched, count: written }),
      {
        headers: { "Content-Type": "application/json" },
        status: 200,
      },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log("ERROR", { message: msg });
    return new Response(JSON.stringify({ error: msg }), {
      headers: { "Content-Type": "application/json" },
      status: 500,
    });
  }
});
