// Returns aggregate stats for the admin dashboard.
//
// Auth: caller must be authenticated AND have role='admin' in user_roles.
// All counts come from the service-role client because users can only see
// their own rows under RLS.

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { buildCorsHeaders, corsPreflightResponse } from "../_shared/cors.ts";

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
    if (!authHeader) return json({ error: "Unauthorized" }, 401);

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) return json({ error: "Unauthorized" }, 401);

    const service = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false },
    });

    // Admin gate via the SQL helper. is_admin() is SECURITY DEFINER, so
    // it returns the truth regardless of which client calls it.
    const { data: adminCheck, error: roleErr } = await service.rpc("is_admin", {
      _user_id: user.id,
    });
    if (roleErr || adminCheck !== true) return json({ error: "Forbidden" }, 403);

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

    // --- Subscriptions (Stripe, best-effort) ------------------------------
    let stripeStats: {
      enabled: boolean;
      activeSubs: number | null;
      mrrEur: number | null;
      error?: string;
    } = { enabled: false, activeSubs: null, mrrEur: null };

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (stripeKey) {
      try {
        const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
        let activeSubs = 0;
        let mrrCents = 0;
        for await (const sub of stripe.subscriptions.list({
          status: "active",
          limit: 100,
        })) {
          activeSubs++;
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
        stripeStats = {
          enabled: true,
          activeSubs,
          mrrEur: Math.round(mrrCents) / 100,
        };
      } catch (e) {
        stripeStats = {
          enabled: true,
          activeSubs: null,
          mrrEur: null,
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
      },
      snapshots: {
        total: totalSnapshots ?? 0,
        encrypted: encryptedCount ?? 0,
        updatedThisWeek: snapshotsWeek ?? 0,
        lastSyncAt: recentSync?.[0]?.updated_at ?? null,
      },
      feedback: {
        total: feedbackTotal ?? 0,
        byType: feedbackBuckets,
        recent: feedbackRecent ?? [],
      },
      subscriptions: stripeStats,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[admin-stats] error:", msg);
    return json({ error: msg }, 500);
  }
});
