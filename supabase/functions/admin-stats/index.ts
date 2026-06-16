// Returns aggregate stats for the admin dashboard.
//
// Auth: caller must be authenticated AND have role='admin' in user_roles.
// All counts come from the service-role client because users can only see
// their own rows under RLS.

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { buildCorsHeaders, corsPreflightResponse } from "../_shared/cors.ts";
import { requireAdmin } from "../_shared/requireAdmin.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflightResponse(req);
  const corsHeaders = buildCorsHeaders(req);

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status,
    });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

    const authHeader = req.headers.get("Authorization");
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader ?? "" } },
    });
    const service = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false },
    });

    const gate = await requireAdmin(authHeader, userClient, service);
    if (!gate.ok) return json({ error: gate.error }, gate.status);

    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

    // --- Users -------------------------------------------------------------
    // auth.admin.listUsers paginates at 1000. Walk pages to get a total
    // and bucket created_at for "new this week/month".
    let totalUsers = 0;
    let newThisWeek = 0;
    let newThisMonth = 0;
    let confirmedUsers = 0;
    let lastSignInWeek = 0;
    let lastSignInMonth = 0;

    let page = 1;
    const perPage = 1000;
    while (true) {
      const { data, error } = await service.auth.admin.listUsers({ page, perPage });
      if (error) throw error;
      const list = data?.users ?? [];
      totalUsers += list.length;
      for (const u of list) {
        if (u.created_at && u.created_at >= weekAgo) newThisWeek++;
        if (u.created_at && u.created_at >= monthAgo) newThisMonth++;
        if (u.email_confirmed_at) confirmedUsers++;
        if (u.last_sign_in_at && u.last_sign_in_at >= weekAgo) lastSignInWeek++;
        if (u.last_sign_in_at && u.last_sign_in_at >= monthAgo) lastSignInMonth++;
      }
      if (list.length < perPage) break;
      page++;
      if (page > 50) break; // safety cap (50k users)
    }

    // --- Snapshots ---------------------------------------------------------
    const { count: totalSnapshots } = await service
      .from("portfolio_snapshots")
      .select("id", { count: "exact", head: true });

    const { data: recentSync } = await service
      .from("portfolio_snapshots")
      .select("updated_at")
      .order("updated_at", { ascending: false })
      .limit(1);

    const { count: snapshotsWeek } = await service
      .from("portfolio_snapshots")
      .select("id", { count: "exact", head: true })
      .gte("updated_at", weekAgo);

    const { count: encryptedCount } = await service
      .from("portfolio_snapshots")
      .select("id", { count: "exact", head: true })
      .eq("enc_version", 1);

    // --- Feedback ----------------------------------------------------------
    const { count: feedbackTotal } = await service
      .from("feedback")
      .select("id", { count: "exact", head: true });

    const { data: feedbackRecent } = await service
      .from("feedback")
      .select("id, type, message, created_at")
      .order("created_at", { ascending: false })
      .limit(10);

    const { data: feedbackByType } = await service
      .from("feedback")
      .select("type");
    const feedbackBuckets = (feedbackByType ?? []).reduce<Record<string, number>>(
      (acc, row) => {
        acc[row.type] = (acc[row.type] ?? 0) + 1;
        return acc;
      },
      {},
    );

    // --- Recovery-phrase adoption -----------------------------------------
    // user_keys has one row per encrypted user. wrapped_dk_recovery is the
    // DK wrapped by the mnemonic; null means the user never set up recovery
    // and would lose everything on a forgotten password (zero-knowledge — we
    // cannot help). This is pure metadata; it reveals nothing about the keys.
    const { count: keysTotal } = await service
      .from("user_keys")
      .select("user_id", { count: "exact", head: true });

    const { count: keysWithRecovery } = await service
      .from("user_keys")
      .select("user_id", { count: "exact", head: true })
      .not("wrapped_dk_recovery", "is", null);

    // --- Profile preference distributions ---------------------------------
    // preferred_currency + reminder_frequency are plaintext preferences, not
    // portfolio data, so they're safe to aggregate. A null preferred_currency
    // means the user never changed it, i.e. the effective default (EUR).
    const { data: profileRows } = await service
      .from("profiles")
      .select("preferred_currency, reminder_frequency");

    const currencyBuckets: Record<string, number> = {};
    const reminderBuckets: Record<string, number> = {};
    for (const row of profileRows ?? []) {
      const cur = row.preferred_currency ?? "EUR";
      currencyBuckets[cur] = (currencyBuckets[cur] ?? 0) + 1;
      const rem = row.reminder_frequency ?? "monthly";
      reminderBuckets[rem] = (reminderBuckets[rem] ?? 0) + 1;
    }

    // --- Subscriptions (Stripe, best-effort) ------------------------------
    let stripeStats: {
      enabled: boolean;
      activeSubs: number | null;
      mrrEur: number | null;
      arrEur: number | null;
      annualSubs: number | null;
      monthlySubs: number | null;
      error?: string;
    } = {
      enabled: false,
      activeSubs: null,
      mrrEur: null,
      arrEur: null,
      annualSubs: null,
      monthlySubs: null,
    };

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (stripeKey) {
      try {
        const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
        let activeSubs = 0;
        let mrrCents = 0;
        let annualSubs = 0;
        let monthlySubs = 0;
        for await (const sub of stripe.subscriptions.list({
          status: "active",
          limit: 100,
        })) {
          activeSubs++;
          // Pro is single-item, so the first item's interval classifies the sub.
          const subInterval = sub.items.data[0]?.price.recurring?.interval;
          if (subInterval === "year") annualSubs++;
          else if (subInterval === "month") monthlySubs++;
          for (const item of sub.items.data) {
            const price = item.price;
            const unit = price.unit_amount ?? 0;
            const qty = item.quantity ?? 1;
            const interval = price.recurring?.interval;
            // Normalize to monthly EUR cents.
            const monthly =
              interval === "year"
                ? Math.round((unit * qty) / 12)
                : interval === "month"
                  ? unit * qty
                  : 0;
            mrrCents += monthly;
          }
        }
        const mrrEur = Math.round(mrrCents) / 100;
        stripeStats = {
          enabled: true,
          activeSubs,
          mrrEur,
          arrEur: Math.round(mrrCents * 12) / 100,
          annualSubs,
          monthlySubs,
        };
      } catch (e) {
        stripeStats = {
          enabled: true,
          activeSubs: null,
          mrrEur: null,
          arrEur: null,
          annualSubs: null,
          monthlySubs: null,
          error: e instanceof Error ? e.message : String(e),
        };
      }
    }

    return json({
      generatedAt: now.toISOString(),
      users: {
        total: totalUsers,
        confirmed: confirmedUsers,
        newThisWeek,
        newThisMonth,
        activeThisWeek: lastSignInWeek,
        activeThisMonth: lastSignInMonth,
      },
      snapshots: {
        total: totalSnapshots ?? 0,
        encrypted: encryptedCount ?? 0,
        updatedThisWeek: snapshotsWeek ?? 0,
        lastSyncAt: recentSync?.[0]?.updated_at ?? null,
      },
      keys: {
        total: keysTotal ?? 0,
        withRecovery: keysWithRecovery ?? 0,
      },
      currencies: currencyBuckets,
      reminders: reminderBuckets,
      feedback: {
        total: feedbackTotal ?? 0,
        byType: feedbackBuckets,
        recent: feedbackRecent ?? [],
      },
      subscriptions: stripeStats,
    });
  } catch (err) {
    // Never echo raw error text to the client — Postgres / Stripe messages
    // can include table names, query fragments, or upstream API detail
    // that should stay in server logs.
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[admin-stats] error:", msg);
    return json({ error: "internal_error" }, 500);
  }
});
