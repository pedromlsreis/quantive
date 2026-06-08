// ingest-healthcheck — a dead-man's switch for the reference-data ingests.
//
// Why this exists: the fx-ingest / benchmark-ingest crons can "succeed" at the
// scheduler level (pg_net enqueues the POST and returns a row id) while every
// actual write silently fails — exactly what happened when pg_net's 5s timeout
// killed benchmark-ingest mid-upsert and the SP500 series froze for a week
// before a user noticed the stale banner. cron success is not a freshness
// signal; the only trustworthy signal is "did fresh rows actually land".
//
// So this function reads the *latest date present* in each ingested dataset and
// alerts the founder by email if any is older than its cadence allows. Silence
// means healthy — that's the dead-man's-switch contract.
//
// It does NOT dedupe alerts: while a dataset stays stale it emails once per
// daily run. For a solo operator a daily nag until fixed is the desired
// behaviour, and it keeps this function stateless.
//
// Auth: shared CRON_SECRET, same as the ingest crons. Not browser-callable.

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { escapeHtml, sendEmail } from "../_shared/email.ts";
import { type DatasetCheck, describeFinding, evaluateFreshness } from "./freshness.ts";

const log = (step: string, details?: unknown) => {
  const d = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[ingest-healthcheck] ${step}${d}`);
};

type SupabaseAdmin = ReturnType<typeof createClient>;

/** Latest date in `benchmarks` for one series_id, or null if none. */
async function latestBenchmark(admin: SupabaseAdmin, seriesId: string): Promise<string | null> {
  const { data, error } = await admin
    .from("benchmarks")
    .select("date")
    .eq("series_id", seriesId)
    .order("date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`benchmarks(${seriesId}) lookup failed: ${error.message}`);
  return (data?.date as string | undefined) ?? null;
}

/** Latest date in `fx_rates` across all currencies, or null if none. */
async function latestFxRate(admin: SupabaseAdmin): Promise<string | null> {
  const { data, error } = await admin
    .from("fx_rates")
    .select("date")
    .order("date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`fx_rates lookup failed: ${error.message}`);
  return (data?.date as string | undefined) ?? null;
}

serve(async (req) => {
  try {
    const expected = Deno.env.get("CRON_SECRET");
    if (!expected) throw new Error("CRON_SECRET is not set");
    const auth = req.headers.get("Authorization");
    if (auth !== `Bearer ${expected}`) {
      return new Response("Unauthorized", { status: 401 });
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } },
    );

    const [sp500, hicp, fx] = await Promise.all([
      latestBenchmark(admin, "sp500"),
      latestBenchmark(admin, "inflation_eu"),
      latestFxRate(admin),
    ]);

    const checks: DatasetCheck[] = [
      { label: "S&P 500 (benchmarks.sp500)", latest: sp500, thresholdDays: 4 },
      { label: "FX rates (fx_rates)", latest: fx, thresholdDays: 4 },
      { label: "Euro-area inflation (benchmarks.inflation_eu)", latest: hicp, thresholdDays: 45 },
    ];

    const now = new Date();
    const findings = evaluateFreshness(checks, now);

    log("checked", {
      latest: { sp500, inflation_eu: hicp, fx },
      stale: findings.map((f) => f.label),
    });

    if (findings.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, stale: [] }),
        { headers: { "Content-Type": "application/json" }, status: 200 },
      );
    }

    // Founder-internal alert: plain block, no branded shell (see email.ts).
    const to = Deno.env.get("ALERT_TO_EMAIL") || Deno.env.get("FEEDBACK_TO_EMAIL") || "hello@usequantive.app";
    const lines = findings.map(describeFinding);
    const subject = `[Quantive] Ingest stale: ${findings.map((f) => f.label.split(" (")[0]).join(", ")}`;

    const html = `
      <div style="font-family: ui-sans-serif, system-ui, sans-serif; max-width: 560px;">
        <h2 style="margin: 0 0 12px;">Reference-data ingest looks stale</h2>
        <p style="margin: 0 0 12px;">The freshness check found ${findings.length} dataset(s) past their threshold. The daily cron may be enqueuing but failing to write (e.g. an HTTP timeout), or an upstream source is down.</p>
        <ul style="margin: 0 0 16px; padding-left: 20px;">
          ${lines.map((l) => `<li style="margin: 0 0 4px;">${escapeHtml(l)}</li>`).join("")}
        </ul>
        <p style="margin: 0 0 8px;"><strong>To investigate:</strong></p>
        <ul style="margin: 0 0 16px; padding-left: 20px;">
          <li style="margin: 0 0 4px;">Check <code>net._http_response</code> for non-200 / NULL status on the ingest crons.</li>
          <li style="margin: 0 0 4px;">Re-run the affected function manually with the CRON_SECRET to see the live error.</li>
        </ul>
        <p style="margin: 0; color: #6b7280; font-size: 13px;">This is an automated check from ingest-healthcheck. It will email once per day while anything stays stale.</p>
      </div>
    `;
    const text =
      `Reference-data ingest looks stale\n\n` +
      `${findings.length} dataset(s) past threshold:\n` +
      lines.map((l) => `  - ${l}`).join("\n") +
      `\n\nInvestigate:\n` +
      `  - Check net._http_response for non-200 / NULL status on the ingest crons.\n` +
      `  - Re-run the affected function manually with the CRON_SECRET to see the live error.\n\n` +
      `Automated check from ingest-healthcheck. Emails once per day while stale.`;

    const result = await sendEmail({ to, subject, html, text });
    if (!result.ok) {
      // The alert itself failed to send — surface as a 500 so the cron run is
      // marked failed and shows up in net._http_response / function logs.
      throw new Error(`alert email failed: ${result.reason}`);
    }

    log("alert sent", { to, stale: findings.length });
    return new Response(
      JSON.stringify({ ok: true, stale: findings.map((f) => ({ label: f.label, latest: f.latest, ageDays: f.ageDays, reason: f.reason })) }),
      { headers: { "Content-Type": "application/json" }, status: 200 },
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
