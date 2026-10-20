// Starts an email change. The caller signed in with their password moments
// ago (checked from the session's amr), so a stolen session alone can't start
// one, and the old inbox isn't needed. A link goes to the new address;
// confirm-email-change finishes the change. Spec: docs/security/encryption.md §8.11.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { sendEmail } from "../_shared/email.ts";
import { buildCorsHeaders, corsPreflightResponse, safeRedirectOrigin } from "../_shared/cors.ts";
import { checkRateLimit, extractIp } from "../_shared/rateLimit.ts";
import { hasRecentPasswordAuth } from "../_shared/recentAuth.ts";
import {
  PENDING_EMAIL_CHANGE_KEY,
  confirmationEmail,
  newEmailChangeRequest,
  normaliseEmail,
  readPendingEmailChange,
} from "../_shared/emailChange.ts";

const RESEND_AFTER_MS = 60_000;

const logStep = (step: string, details?: unknown) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[REQUEST-EMAIL-CHANGE] ${step}${detailsStr}`);
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
    const rate = await checkRateLimit(admin, { ip, bucket: "request-email-change", maxRequests: 5, windowSeconds: 60 });
    if (!rate.allowed) {
      logStep("Rate-limited", { ip });
      return respond({ error: "rate_limited" }, 429, { "Retry-After": String(rate.retryAfter) });
    }

    const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "").trim();
    if (!token) return respond({ error: "unauthenticated" }, 401);
    const { data: userData, error: userError } = await admin.auth.getUser(token);
    const user = userData.user;
    if (userError || !user?.email || !user.email_confirmed_at) {
      logStep("Unauthenticated", { reason: userError?.message });
      return respond({ error: "unauthenticated" }, 401);
    }

    if (!hasRecentPasswordAuth(token, Math.floor(Date.now() / 1000))) {
      return respond({ error: "password_required" }, 403);
    }

    let body: unknown = null;
    try {
      body = await req.json();
    } catch {
      // Falls through as an invalid address.
    }
    const email = normaliseEmail((body as { email?: unknown } | null)?.email);
    if (!email) return respond({ error: "invalid_email" }, 400);
    if (email === user.email.toLowerCase()) return respond({ error: "same_email" }, 400);

    // One link a minute per account, whatever the IP, as Supabase does for
    // its own emails.
    const previous = readPendingEmailChange(user.app_metadata);
    if (previous && Date.now() - Date.parse(previous.sent_at) < RESEND_AFTER_MS) {
      return respond({ error: "rate_limited" }, 429, { "Retry-After": String(RESEND_AFTER_MS / 1000) });
    }

    // A new request replaces any earlier one, whose link then stops working.
    const { token: linkToken, pending } = await newEmailChangeRequest(user.email, email, new Date());
    const { error: storeError } = await admin.auth.admin.updateUserById(user.id, {
      app_metadata: { [PENDING_EMAIL_CHANGE_KEY]: pending },
    });
    if (storeError) {
      logStep("ERROR storing request", { message: storeError.message });
      return respond({ error: "request_failed" }, 500);
    }

    const mail = confirmationEmail(`${safeRedirectOrigin(req)}/confirm-email#t=${linkToken}`);
    const sent = await sendEmail({ to: email, ...mail });
    if (!sent.ok) {
      // Withdraw it, so Settings doesn't show a change waiting on an email
      // that never went.
      await admin.auth.admin.updateUserById(user.id, { app_metadata: { [PENDING_EMAIL_CHANGE_KEY]: null } });
      logStep("ERROR sending link", { reason: sent.reason });
      return respond({ error: "send_failed" }, 502);
    }

    logStep("Link sent", { userId: user.id });
    return respond({ email, expires_at: pending.expires_at });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: errorMessage });
    return respond({ error: "request_failed" }, 500);
  }
});
