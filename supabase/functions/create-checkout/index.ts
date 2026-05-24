import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { findOrCreateStripeCustomer } from "../_shared/stripeCustomer.ts";

import { buildCorsHeaders, corsPreflightResponse, safeRedirectOrigin } from "../_shared/cors.ts";
import { checkRateLimit, extractIp } from "../_shared/rateLimit.ts";

const logStep = (step: string, details?: unknown) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[CREATE-CHECKOUT] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflightResponse(req);
  const corsHeaders = buildCorsHeaders(req);

  const supabaseClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? ""
  );

  // Service-role client just for the rate-limit RPC, which is SECURITY
  // DEFINER and does not need the user's JWT.
  const admin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } },
  );

  // Error codes are stable identifiers the client maps to a user-facing
  // string. Internal detail (stack traces, missing env var names, Stripe
  // messages) stays in logs — it must not reach the browser.
  const errorResponse = (code: string, status: number, extraHeaders: Record<string, string> = {}) =>
    new Response(JSON.stringify({ error: code }), {
      headers: { ...corsHeaders, "Content-Type": "application/json", ...extraHeaders },
      status,
    });

  try {
    logStep("Function started");

    // Throttle per source IP. 10 checkouts/minute is enough headroom for a
    // user who toggles the monthly/yearly switch a few times and impossible
    // to abuse meaningfully. Fails open on RPC error (see rateLimit.ts).
    const ip = extractIp(req);
    const rate = await checkRateLimit(admin, { ip, bucket: "create-checkout", maxRequests: 10, windowSeconds: 60 });
    if (!rate.allowed) {
      logStep("Rate-limited", { ip });
      return errorResponse("rate_limited", 429, { "Retry-After": String(rate.retryAfter) });
    }

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) {
      logStep("ERROR: STRIPE_SECRET_KEY not set");
      return errorResponse("checkout_unavailable", 503);
    }

    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "").trim();
    if (!token) return errorResponse("unauthenticated", 401);

    const { data, error: userError } = await supabaseClient.auth.getUser(token);
    const user = data.user;
    if (userError || !user?.email) {
      logStep("Unauthenticated", { reason: userError?.message });
      return errorResponse("unauthenticated", 401);
    }
    if (!user.email_confirmed_at) {
      logStep("Email not confirmed", { userId: user.id });
      return errorResponse("email_unverified", 403);
    }
    logStep("User authenticated", { userId: user.id });

    let priceId: unknown;
    try {
      ({ priceId } = await req.json());
    } catch {
      return errorResponse("invalid_request", 400);
    }
    if (typeof priceId !== "string" || !priceId) {
      return errorResponse("invalid_request", 400);
    }
    logStep("Price ID received", { priceId });

    // Refuse to create a second active subscription on the same Stripe
    // customer. Without this, a Pro user who clicks "subscribe" again (e.g.
    // through a stale tab or browser back-button) ends up double-billed.
    // The cache row is the source of truth here — the webhook writes it on
    // every subscription event, so it cannot meaningfully race with the
    // user's own click. Cancelled users (`canceled` / null) still proceed:
    // re-subscribing is a legitimate flow.
    const { data: existing } = await admin
      .from("profiles")
      .select("subscription_status")
      .eq("user_id", user.id)
      .maybeSingle();
    const existingStatus = (existing as { subscription_status?: string | null } | null)?.subscription_status ?? null;
    if (existingStatus === "active" || existingStatus === "trialing" || existingStatus === "past_due") {
      logStep("Already subscribed — refusing duplicate checkout", { userId: user.id, status: existingStatus });
      return errorResponse("already_subscribed", 409);
    }

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    // Always resolve to a customer with metadata.supabase_user_id set, so
    // every downstream lookup (check-subscription, customer-portal, webhook)
    // can match by user id rather than by mutable email.
    const customer = await findOrCreateStripeCustomer(stripe, user.id, user.email);
    logStep("Stripe customer resolved", { customerId: customer.id });

    const origin = safeRedirectOrigin(req);
    const session = await stripe.checkout.sessions.create({
      customer: customer.id,
      client_reference_id: user.id,
      line_items: [{ price: priceId, quantity: 1 }],
      mode: "subscription",
      allow_promotion_codes: true,
      success_url: `${origin}/dashboard?checkout=success`,
      cancel_url: `${origin}/pricing`,
    });

    logStep("Checkout session created", { sessionId: session.id });

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: errorMessage });
    return errorResponse("checkout_unavailable", 503);
  }
});
