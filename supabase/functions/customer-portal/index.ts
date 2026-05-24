import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { findStripeCustomer } from "../_shared/stripeCustomer.ts";
import { buildCorsHeaders, corsPreflightResponse, safeRedirectOrigin } from "../_shared/cors.ts";
import { checkRateLimit, extractIp } from "../_shared/rateLimit.ts";

const logStep = (step: string, details?: unknown) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[CUSTOMER-PORTAL] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflightResponse(req);
  const corsHeaders = buildCorsHeaders(req);

  const admin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } },
  );

  const errorResponse = (code: string, status: number, extraHeaders: Record<string, string> = {}) =>
    new Response(JSON.stringify({ error: code }), {
      headers: { ...corsHeaders, "Content-Type": "application/json", ...extraHeaders },
      status,
    });

  try {
    logStep("Function started");

    const ip = extractIp(req);
    const rate = await checkRateLimit(admin, { ip, bucket: "customer-portal", maxRequests: 10, windowSeconds: 60 });
    if (!rate.allowed) {
      logStep("Rate-limited", { ip });
      return errorResponse("rate_limited", 429, { "Retry-After": String(rate.retryAfter) });
    }

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) {
      logStep("ERROR: STRIPE_SECRET_KEY not set");
      return errorResponse("portal_unavailable", 503);
    }

    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "").trim();
    if (!token) return errorResponse("unauthenticated", 401);

    const { data: userData, error: userError } = await admin.auth.getUser(token);
    const user = userData.user;
    if (userError || !user?.email) {
      logStep("Unauthenticated", { reason: userError?.message });
      return errorResponse("unauthenticated", 401);
    }
    logStep("User authenticated", { userId: user.id });

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
    const customer = await findStripeCustomer(stripe, user.id, user.email);
    if (!customer) {
      logStep("No Stripe customer found for user", { userId: user.id });
      return errorResponse("not_found", 404);
    }

    const origin = safeRedirectOrigin(req);
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: customer.id,
      return_url: `${origin}/settings`,
    });

    logStep("Portal session created");

    return new Response(JSON.stringify({ url: portalSession.url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: errorMessage });
    return errorResponse("portal_unavailable", 503);
  }
});
