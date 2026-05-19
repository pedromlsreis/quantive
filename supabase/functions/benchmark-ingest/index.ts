import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

// benchmark-ingest mirrors fx-ingest: a cron-friendly Edge Function that
// fetches the latest values for a small set of official reference series and
// upserts them into public.benchmarks. v1 covers two series:
//   * inflation_eu — Eurostat HICP monthly index (`prc_hicp_midx`, EA, CP00,
//     I15 = 2015=100). Monthly cadence, ~3-week publication lag.
//   * sp500       — FRED daily series SP500 (USD). Daily cadence, ~1 trading
//     day publication lag, ~10-year retention on FRED's free CSV endpoint.
//
// Body shape:
//   {}                                 → fetch each series' full available
//                                        history and upsert (idempotent).
//   { "series": "inflation_eu" }       → only that series.
//   { "series": "sp500" }              → only that series.
//
// All fetches are official-source, no API key required. Failures throw and
// produce a 500 with the error message — visible in Supabase function logs.

const log = (step: string, details?: unknown) => {
  const d = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[BENCHMARK-INGEST] ${step}${d}`);
};

type Row = {
  series_id: string;
  date: string;        // YYYY-MM-DD
  value: number;
  currency: string | null;
  source: string;
};

// ─── Eurostat HICP (inflation_eu) ──────────────────────────────────────────
//
// SDMX 2.1 JSON API. Filter:
//   coicop=CP00 (all items), geo=EA (euro area, all 20 members), unit=I15
//   (index 2015=100, the standard rebase), freq=M (monthly).
// Eurostat returns periods as e.g. "2026-02"; we normalise to first-of-month.

const EUROSTAT_URL =
  "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/" +
  "prc_hicp_midx?format=JSON&coicop=CP00&geo=EA&unit=I15&freq=M";

type EurostatJson = {
  value: Record<string, number>;
  dimension: {
    time: { category: { index: Record<string, number> } };
  };
};

function eurostatPeriodToDate(period: string): string {
  // Eurostat monthly periods are "YYYY-MM". Anchor to the 1st of the month
  // so the client's "month-end ≤ date" lookup is unambiguous.
  const m = /^(\d{4})-(\d{2})$/.exec(period);
  if (!m) throw new Error(`Unexpected Eurostat period format: ${period}`);
  return `${m[1]}-${m[2]}-01`;
}

async function fetchInflationEu(): Promise<Row[]> {
  const resp = await fetch(EUROSTAT_URL);
  if (!resp.ok) {
    throw new Error(`Eurostat ${resp.status}: ${await resp.text()}`);
  }
  const json = (await resp.json()) as EurostatJson;
  const timeIndex = json.dimension?.time?.category?.index;
  if (!timeIndex) {
    throw new Error("Eurostat response missing dimension.time.category.index");
  }
  // timeIndex maps "YYYY-MM" → position. value maps position-as-string → number.
  const periodByIdx = new Map<number, string>();
  for (const [period, idx] of Object.entries(timeIndex)) {
    periodByIdx.set(idx, period);
  }
  const rows: Row[] = [];
  for (const [idxStr, value] of Object.entries(json.value)) {
    const idx = Number(idxStr);
    const period = periodByIdx.get(idx);
    if (!period || typeof value !== "number") continue;
    rows.push({
      series_id: "inflation_eu",
      date: eurostatPeriodToDate(period),
      value,
      currency: null,
      source: "eurostat",
    });
  }
  return rows;
}

// ─── FRED SP500 (sp500) ────────────────────────────────────────────────────
//
// FRED's CSV endpoint requires no API key. Format:
//   observation_date,SP500
//   2016-01-04,2012.66
//   ...
//   2026-05-15,5310.12
// Missing values are encoded as "." — we skip those rows.

const FRED_URL = "https://fred.stlouisfed.org/graph/fredgraph.csv?id=SP500";

async function fetchSp500(): Promise<Row[]> {
  const resp = await fetch(FRED_URL);
  if (!resp.ok) {
    throw new Error(`FRED ${resp.status}: ${await resp.text()}`);
  }
  const text = await resp.text();
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) {
    throw new Error(`FRED CSV unexpectedly empty (${lines.length} lines)`);
  }
  // First line is header. Tolerant to either "observation_date" or "DATE".
  const header = lines[0].toLowerCase();
  if (!header.includes("sp500") && !header.includes("sp_500")) {
    throw new Error(`FRED CSV header missing SP500: ${lines[0]}`);
  }
  const rows: Row[] = [];
  for (let i = 1; i < lines.length; i++) {
    const [date, valueRaw] = lines[i].split(",");
    if (!date || !valueRaw) continue;
    if (valueRaw === "." || valueRaw === "NA") continue; // FRED's missing-value sentinel
    const value = Number(valueRaw);
    if (!Number.isFinite(value)) continue;
    rows.push({
      series_id: "sp500",
      date,
      value,
      currency: "USD",
      source: "fred",
    });
  }
  return rows;
}

// ─── HTTP entry point ──────────────────────────────────────────────────────

type Body = { series?: "inflation_eu" | "sp500" };

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

    const allRows: Row[] = [];
    const fetched: Record<string, number> = {};

    if (!body.series || body.series === "inflation_eu") {
      log("Fetching Eurostat HICP");
      const rows = await fetchInflationEu();
      fetched.inflation_eu = rows.length;
      allRows.push(...rows);
    }
    if (!body.series || body.series === "sp500") {
      log("Fetching FRED SP500");
      const rows = await fetchSp500();
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

    log("Upserted rows", { written, fetched });
    return new Response(
      JSON.stringify({ ok: true, fetched, count: written }),
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
