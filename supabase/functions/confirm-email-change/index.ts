// Finishes an email change that request-email-change started. Takes the token
// from the emailed link and a signed-in session for the same account: the link
// proves the new inbox, and the session stops someone who receives a mistyped
// address from moving the account to it. The change is an admin update, so
// Supabase's own two-link flow (still on for direct Auth API calls) isn't
// involved. Spec: docs/security/encryption.md §8.11.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { sendEmail } from "../_shared/email.ts";
import { buildCorsHeaders, corsPreflightResponse } from "../_shared/cors.ts";
import { checkRateLimit, extractIp } from "../_shared/rateLimit.ts";
import { findStripeCustomer, syncCustomerEmail } from "../_shared/stripeCustomer.ts";
import {
  PENDING_EMAIL_CHANGE_KEY,
  changedNoticeEmail,
  checkEmailChangeToken,
  isLinkToken,
  readPendingEmailChange,
} from "../_shared/emailChange.ts";

const logStep = (step: string, details?: unknown) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[CONFIRM-EMAIL-CHANGE] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflightResponse(req);
  const corsHeaders = buildCorsHeaders(req);

  const admin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } },
  );

  const respond = (body: unknown, status = 200, extraHeaders: Record<string, string> = {}) =>
    new Response(JSON.stringify(body), {
      headers: { ...corsHeaders, "Content-Type": "application/json", ...extraHeaders },
      status,
    });

  try {
    const ip = extractIp(req);
    const rate = await checkRateLimit(admin, { ip, bucket: "confirm-email-change", maxRequests: 10, windowSeconds: 60 });
    if (!rate.allowed) {
      logStep("Rate-limited", { ip });
      return respond({ error: "rate_limited" }, 429, { "Retry-After": String(rate.retryAfter) });
    }

    const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "").trim();
    if (!token) return respond({ error: "unauthenticated" }, 401);
    const { data: userData, error: userError } = await admin.auth.getUser(token);
    const user = userData.user;
    if (userError || !user?.email) {
      logStep("Unauthenticated", { reason: userError?.message });
      return respond({ error: "unauthenticated" }, 401);
    }

    let body: unknown = null;
    try {
      body = await req.json();
    } catch {
      // Falls through as an invalid request.
    }
    const linkToken = (body as { token?: unknown } | null)?.token;
    if (!isLinkToken(linkToken)) return respond({ error: "invalid_request" }, 400);

    const now = new Date();
    const pending = readPendingEmailChange(user.app_metadata);
    const verdict = await checkEmailChangeToken(pending, linkToken, user.email, now);
    const clearRequest = () =>
      admin.auth.admin.updateUserById(user.id, { app_metadata: { [PENDING_EMAIL_CHANGE_KEY]: null } });
    if (verdict === "changed") await clearRequest();
    if (verdict !== "ok" || !pending) {
      return respond({ error: verdict }, verdict === "expired" ? 410 : 409);
    }

    const { error: updateError } = await admin.auth.admin.updateUserById(user.id, {
      email: pending.email,
      email_confirm: true,
      app_metadata: { [PENDING_EMAIL_CHANGE_KEY]: null },
    });
    if (updateError) {
      // Taken since the request: Supabase allows one account per address.
      if (updateError.code === "email_exists" || /already been registered/i.test(updateError.message)) {
        await clearRequest();
        return respond({ error: "email_taken" }, 409);
      }
      logStep("ERROR updating email", { message: updateError.message });
      return respond({ error: "confirm_failed" }, 500);
    }
    logStep("Email changed", { userId: user.id });

    // The change is done; the rest is best effort.
    const { data: profile } = await admin
      .from("profiles")
      .select("stripe_customer_id")
      .eq("user_id", user.id)
      .maybeSingle();
    const cachedCustomerId = (profile as { stripe_customer_id?: string | null } | null)?.stripe_customer_id ?? null;
    const results = await Promise.allSettled([
      sendEmail({
        to: pending.from,
        ...changedNoticeEmail(pending.email, now),
        replyTo: Deno.env.get("FOUNDER_REPLY_TO_EMAIL") || "hello@usequantive.app",
      }),
      syncStripeEmail(cachedCustomerId, user.id, pending.from, pending.email),
    ]);
    for (const result of results) {
      if (result.status === "rejected") logStep("Follow-up failed", { message: String(result.reason) });
    }

    return respond({ email: pending.email });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: errorMessage });
    return respond({ error: "confirm_failed" }, 500);
  }
});

// Receipts and payment emails go to Stripe's copy of the address. The customer
// is found by the id the webhook cached, else by user id, else by the old
// address (a customer from before metadata was set).
async function syncStripeEmail(cachedId: string | null, userId: string, oldEmail: string, newEmail: string) {
  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  if (!stripeKey) return;
  const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
  let customer: Stripe.Customer | null;
  if (cachedId) {
    const retrieved = await stripe.customers.retrieve(cachedId);
    customer = "deleted" in retrieved && retrieved.deleted ? null : (retrieved as Stripe.Customer);
  } else {
    customer = await findStripeCustomer(stripe, userId, oldEmail);
  }
  if (customer && (await syncCustomerEmail(stripe, customer, newEmail))) {
    logStep("Stripe customer email updated", { customerId: customer.id });
  }
}
