import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

// Foreign currencies tracked. EUR is the base and has no row by definition.
// Add a currency here when CurrencyContext gains support for it.
const SUPPORTED = ["USD", "GBP", "NOK"];

const log = (step: string, details?: unknown) => {
  const d = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[FX-INGEST] ${step}${d}`);
};

serve(async (req) => {
  try {
    // Cron caller authenticates with a shared secret (set via `supabase
    // secrets set CRON_SECRET=...`). verify_jwt is off for this function so
    // the secret is the only gate — keep it out of logs and version control.
    const expected = Deno.env.get("CRON_SECRET");
    if (!expected) throw new Error("CRON_SECRET is not set");
    const auth = req.headers.get("Authorization");
    if (auth !== `Bearer ${expected}`) {
      return new Response("Unauthorized", { status: 401 });
    }

    log("Function started");

    // Frankfurter returns ECB reference rates with EUR as base:
    //   { date: "2026-05-14", rates: { USD: 1.07, GBP: 0.85, NOK: 11.50 } }
    // i.e. "1 EUR = 1.07 USD". We invert to get rate_to_base ("EUR per 1
    // unit of currency"). On weekends/holidays ECB doesn't publish and the
    // API returns the most recent business day's rates — the upsert is
    // idempotent on (date, currency), so re-running is a no-op.
    const symbols = SUPPORTED.join(",");
    const resp = await fetch(
      `https://api.frankfurter.dev/v1/latest?base=EUR&symbols=${symbols}`,
    );
    if (!resp.ok) {
      throw new Error(`Frankfurter ${resp.status}: ${await resp.text()}`);
    }
    const { date, rates } = (await resp.json()) as {
      date: string;
      rates: Record<string, number>;
    };
    log("Fetched rates", { date, rates });

    const rows = Object.entries(rates).map(([currency, targetPerEur]) => ({
      date,
      currency,
      rate_to_base: 1 / targetPerEur,
    }));

    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } },
    );

    const { error } = await admin
      .from("fx_rates")
      .upsert(rows, { onConflict: "date,currency" });
    if (error) throw error;

    log("Upserted rows", { count: rows.length, date });
    return new Response(
      JSON.stringify({ ok: true, date, count: rows.length }),
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
