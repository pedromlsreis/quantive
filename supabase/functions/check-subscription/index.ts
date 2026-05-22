import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { findStripeCustomer } from "../_shared/stripeCustomer.ts";
import { buildCorsHeaders, corsPreflightResponse } from "../_shared/cors.ts";
import { pickEntitledSubscription } from "./entitled.ts";
import {
  buildCacheRow,
  emptyView,
  viewFromCacheRow,
  type SubscriptionView,
} from "../_shared/subscriptionCache.ts";

const logStep = (step: string, details?: unknown) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[CHECK-SUBSCRIPTION] ${step}${detailsStr}`);
};

// Per-instance negative cache: protects Stripe from being hammered on a hot
// loop if the persisted cache (profiles.subscription_synced_at) ever fails
// to populate — e.g. a transient profile-write failure during webhook delivery.
// Keyed by user id; entries TTL'd to 60 s. Stateless across cold starts, which
// is fine: the first request after a cold start re-hits Stripe once, then
// short-circuits subsequent requests on the same instance.
const liveLookupCache = new Map<string, { view: SubscriptionView; expiresAt: number }>();
const LIVE_TTL_MS = 60_000;

function getNegativeCache(userId: string): SubscriptionView | null {
  const hit = liveLookupCache.get(userId);
  if (!hit) return null;
  if (hit.expiresAt < Date.now()) {
    liveLookupCache.delete(userId);
    return null;
  }
  return hit.view;
}

function setNegativeCache(userId: string, view: SubscriptionView) {
  liveLookupCache.set(userId, { view, expiresAt: Date.now() + LIVE_TTL_MS });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflightResponse(req);
  const corsHeaders = buildCorsHeaders(req);

  const admin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } }
  );

  const respond = (view: SubscriptionView) =>
    new Response(JSON.stringify(view), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });

  try {
    logStep("Function started");

    const authHeader = req.headers.get("Authorization");
    const token = authHeader?.replace("Bearer ", "").trim() ?? "";
    if (!token) {
      logStep("No bearer token — returning unsubscribed");
      return respond(emptyView());
    }

    const { data: userData, error: userError } = await admin.auth.getUser(token);
    if (userError || !userData.user?.email) {
      // Anon key, expired token, or otherwise no resolvable user — not a 500.
      logStep("No authenticated user — returning unsubscribed", { reason: userError?.message });
      return respond(emptyView());
    }
    const user = userData.user;
    logStep("User authenticated", { userId: user.id });

    // 1) Read the cache. The webhook is the source of truth — if it has
    //    populated subscription_synced_at at least once, we trust it and
    //    skip the live Stripe round-trip entirely.
    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("subscription_status, subscription_product_id, subscription_end, subscription_cancel_at_period_end, subscription_synced_at, stripe_customer_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (profileError) {
      // Cache read should never fail; log and continue to live fallback.
      console.error("[check-subscription] profile read failed:", profileError.message);
    }

    if (profile?.subscription_synced_at) {
      logStep("Serving from cache", { status: profile.subscription_status, syncedAt: profile.subscription_synced_at });
      return respond(viewFromCacheRow(profile));
    }

    // 1b) In-memory short-TTL cache — shields Stripe from request floods if
    //     the persisted cache hasn't populated yet (rare; only happens between
    //     the very first sign-in and the first webhook delivery, or if a
    //     profile-write fails). On HN traffic, the per-instance map keeps
    //     repeated dashboard loads off the Stripe API.
    const cached = getNegativeCache(user.id);
    if (cached) {
      logStep("Serving from in-memory live cache");
      return respond(cached);
    }

    // 2) Cache miss — fall back to a live Stripe lookup, then backfill.
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) {
      logStep("STRIPE_SECRET_KEY not set — returning unsubscribed");
      return respond(emptyView());
    }
    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
    const customer = await findStripeCustomer(stripe, user.id, user.email);
    if (!customer) {
      logStep("No Stripe customer found");
      // Mark the cache so we don't repeat this lookup forever. An empty
      // cache row with synced_at set is the "I checked, you're not paying"
      // state; a future webhook on subscription.created will overwrite it.
      await admin
        .from("profiles")
        .update({
          subscription_status: null,
          subscription_synced_at: new Date().toISOString(),
        })
        .eq("user_id", user.id);
      setNegativeCache(user.id, emptyView());
      return respond(emptyView());
    }

    const subscriptions = await stripe.subscriptions.list({
      customer: customer.id,
      status: "all",
      limit: 10,
    });

    const subscription = pickEntitledSubscription(subscriptions.data);

    if (!subscription) {
      logStep("No entitled subscription found");
      await admin
        .from("profiles")
        .update({
          stripe_customer_id: customer.id,
          subscription_status: null,
          subscription_product_id: null,
          subscription_end: null,
          subscription_cancel_at_period_end: false,
          subscription_synced_at: new Date().toISOString(),
        })
        .eq("user_id", user.id);
      setNegativeCache(user.id, emptyView());
      return respond(emptyView());
    }

    const row = buildCacheRow(subscription as unknown as Parameters<typeof buildCacheRow>[0]);
    const { error: backfillError } = await admin
      .from("profiles")
      .update({ ...row, stripe_customer_id: customer.id })
      .eq("user_id", user.id);
    if (backfillError) {
      console.error("[check-subscription] cache backfill failed:", backfillError.message);
    }

    logStep("Entitled subscription found (live)", { subscriptionId: subscription.id, status: subscription.status });
    const liveView = viewFromCacheRow({
      subscription_status: row.subscription_status,
      subscription_product_id: row.subscription_product_id,
      subscription_end: row.subscription_end,
      subscription_cancel_at_period_end: row.subscription_cancel_at_period_end,
    });
    setNegativeCache(user.id, liveView);
    return respond(liveView);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: errorMessage });
    // Fail-soft: returning an empty entitled view is safer than 500ing the
    // entire dashboard. The user sees Free temporarily; a refresh re-tries.
    return respond(emptyView());
  }
});
