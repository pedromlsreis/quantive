import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

// We persist *every* currency Frankfurter publishes — no `symbols` filter on
// the API call. The client decides which currencies to display via
// `src/lib/currencies.ts`. This keeps the source of truth in one place and
// means adding a new currency on the client requires no edge function deploy.

const log = (step: string, details?: unknown) => {
  const d = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[FX-INGEST] ${step}${d}`);
};

type FrankfurterLatest = { date: string; rates: Record<string, number> };
type FrankfurterRange = {
  start_date: string;
  end_date: string;
  rates: Record<string, Record<string, number>>;
};

type Row = { date: string; currency: string; rate_to_base: number };

function rowsFromLatest(payload: FrankfurterLatest): Row[] {
  return Object.entries(payload.rates).map(([currency, targetPerEur]) => ({
    date: payload.date,
    currency,
    rate_to_base: 1 / targetPerEur,
  }));
}

function rowsFromRange(payload: FrankfurterRange): Row[] {
  const out: Row[] = [];
  for (const [date, perDay] of Object.entries(payload.rates)) {
    for (const [currency, targetPerEur] of Object.entries(perDay)) {
      out.push({ date, currency, rate_to_base: 1 / targetPerEur });
    }
  }
  return out;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

serve(async (req) => {
  try {
    const expected = Deno.env.get("CRON_SECRET");
    if (!expected) throw new Error("CRON_SECRET is not set");
    const auth = req.headers.get("Authorization");
    if (auth !== `Bearer ${expected}`) {
      return new Response("Unauthorized", { status: 401 });
    }

    // Body shape:
    //   {}                             → latest mode (daily cron)
    //   { "from": "YYYY-MM-DD",
    //     "to":   "YYYY-MM-DD" }       → backfill mode (one-shot)
    // We accept an empty body too: cron posts '{}' but a manual curl may not.
    let body: { from?: string; to?: string } = {};
    const text = await req.text();
    if (text.trim()) {
      try {
        body = JSON.parse(text);
      } catch {
        throw new Error("Body must be JSON or empty");
      }
    }

    let rows: Row[];
    let summaryRange: string;

    if (body.from || body.to) {
      if (!body.from || !body.to) {
        throw new Error("Backfill requires both 'from' and 'to'");
      }
      if (!ISO_DATE.test(body.from) || !ISO_DATE.test(body.to)) {
        throw new Error("Dates must be YYYY-MM-DD");
      }
      if (body.from > body.to) {
        throw new Error("'from' must be <= 'to'");
      }

      log("Backfill mode", { from: body.from, to: body.to });
      const url = `https://api.frankfurter.dev/v1/${body.from}..${body.to}?base=EUR`;
      const resp = await fetch(url);
      if (!resp.ok) {
        throw new Error(`Frankfurter ${resp.status}: ${await resp.text()}`);
      }
      const payload = (await resp.json()) as FrankfurterRange;
      rows = rowsFromRange(payload);
      summaryRange = `${payload.start_date}..${payload.end_date}`;
    } else {
      log("Latest mode");
      const resp = await fetch("https://api.frankfurter.dev/v1/latest?base=EUR");
      if (!resp.ok) {
        throw new Error(`Frankfurter ${resp.status}: ${await resp.text()}`);
      }
      const payload = (await resp.json()) as FrankfurterLatest;
      rows = rowsFromLatest(payload);
      summaryRange = payload.date;
    }

    log("Fetched rows", { count: rows.length, range: summaryRange });

    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } },
    );

    // Chunked upsert: PostgREST has a payload-size limit; a multi-year
    // backfill across ~30 currencies (every Frankfurter symbol) easily
    // exceeds it. 500 rows/chunk keeps each request comfortably small.
    const CHUNK = 500;
    let written = 0;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const slice = rows.slice(i, i + CHUNK);
      const { error } = await admin
        .from("fx_rates")
        .upsert(slice, { onConflict: "date,currency" });
      if (error) throw error;
      written += slice.length;
    }

    log("Upserted rows", { written, range: summaryRange });
    return new Response(
      JSON.stringify({ ok: true, range: summaryRange, count: written }),
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
