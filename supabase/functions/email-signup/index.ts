import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildCorsHeaders, corsPreflightResponse, safeRedirectOrigin } from "../_shared/cors.ts";
import { sendEmail } from "../_shared/email.ts";
import {
  CONFIRMATION_EMAIL_VERSION,
  DAILY_CONFIRMATION_CAP,
  confirmationEmail,
  newConfirmToken,
  shouldSendConfirmation,
} from "../_shared/emailList.ts";
import { checkRateLimit, extractIp } from "../_shared/rateLimit.ts";
import { verifyTurnstile } from "../_shared/turnstile.ts";
import { parseEmailSignupBody } from "./validation.ts";

// Adds an address to the "Keep me posted" list as a request and emails a
// confirmation link (double opt-in); email-list confirms it. Every 200 has the
// same body, whether the address was new, waiting or confirmed. Timing still
// differs, since only some requests send email, and while a write or a send
// fails a listed address still gets 200 where a new one gets 500 or 502, so
// membership is not secret from a determined prober; the list holds nothing
// beyond the address.
// The client requires `confirmation`, so a frontend talking to the older
// function shows an error instead of "check your inbox".
const OK = { success: true, confirmation: "requested" };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflightResponse(req);
  const corsHeaders = buildCorsHeaders(req);
  const json = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json", ...extra },
    });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) {
      console.error("Missing env vars", { hasUrl: !!supabaseUrl, hasKey: !!serviceRoleKey });
      return json({ error: "Server configuration error" }, 500);
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const ip = extractIp(req);

    // Rate limit first — email-signup is unauthenticated (verify_jwt = false),
    // so a per-IP cap is a cheap backstop alongside Turnstile. 5/minute is
    // generous for a human and still caps a scripted flood.
    const rate = await checkRateLimit(adminClient, {
      ip,
      bucket: "email-signup",
      maxRequests: 5,
      windowSeconds: 60,
    });
    if (!rate.allowed) {
      console.warn(`[RATE_LIMIT] email-signup rejected ip=${ip}`);
      return json({ error: "Too many requests" }, 429, { "Retry-After": String(rate.retryAfter) });
    }

    const rawBody = await req.json().catch(() => null);
    const parsed = parseEmailSignupBody(rawBody);
    if (!parsed.ok) return json({ error: parsed.error }, parsed.status);

    // This endpoint emails any address it is given, so it never runs unguarded:
    // without the Turnstile secret it sends nothing unless the dev-only
    // override is set, and without the consent key a confirmation could never
    // be recorded.
    const captcha = await verifyTurnstile(parsed.token, ip);
    if (!captcha.ok) return json({ error: "Captcha verification failed" }, 403);
    if (captcha.skipped && Deno.env.get("ALLOW_UNVERIFIED_EMAIL_SIGNUP") !== "1") {
      console.error("email-signup: TURNSTILE_SECRET_KEY is not set; refusing to send");
      return json({ error: "Signup unavailable" }, 503);
    }
    if (!Deno.env.get("EMAIL_CONSENT_HMAC_KEY")) {
      console.error("email-signup: EMAIL_CONSENT_HMAC_KEY is not set; refusing to send");
      return json({ error: "Signup unavailable" }, 503);
    }

    // A day's worth of confirmation emails far beyond real traffic means abuse:
    // stop sending before it hurts the domain that also carries auth email.
    // Checked before the address is looked up, so while the cap holds every
    // request gets the same 503 and none shows whether its address is listed.
    // A resend moves its row's confirm_sent_at, so count each recent row's sends,
    // not its rows. Sends older than a day are counted too: the cap can trip
    // early, never late.
    const { data: recent, error: countError } = await adminClient
      .from("email_signups")
      .select("confirm_send_count")
      .gt("confirm_sent_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
    if (countError) {
      console.error("email-signup count error:", countError);
      return json({ error: "Failed to save email" }, 500);
    }
    const sentToday = (recent ?? []).reduce(
      (sum: number, row: { confirm_send_count: number }) => sum + row.confirm_send_count,
      0,
    );
    if (sentToday >= DAILY_CONFIRMATION_CAP) {
      console.error(`[ALERT] email-signup: daily confirmation cap of ${DAILY_CONFIRMATION_CAP} reached; refusing`);
      return json({ error: "Signup unavailable" }, 503);
    }

    const { data: existing, error: readError } = await adminClient
      .from("email_signups")
      .select("source, confirmed_at, confirm_token_hash, confirm_sent_at, confirm_send_count, confirm_email_version")
      .eq("email", parsed.email)
      .maybeSingle();
    if (readError) {
      console.error("email-signup read error:", readError);
      return json({ error: "Failed to save email" }, 500);
    }

    // Already confirmed, a link sent moments ago, or this address's sends used up.
    if (!shouldSendConfirmation(existing, new Date())) return json(OK);

    // A new link replaces any earlier one, which then stops working.
    const { token, hash } = await newConfirmToken();
    const { error: writeError } = await adminClient
      .from("email_signups")
      .upsert(
        {
          email: parsed.email,
          source: parsed.source,
          confirm_token_hash: hash,
          confirm_sent_at: new Date().toISOString(),
          confirm_send_count: (existing?.confirm_send_count ?? 0) + 1,
          confirm_email_version: CONFIRMATION_EMAIL_VERSION,
        },
        { onConflict: "email" },
      );
    if (writeError) {
      console.error("email-signup write error:", writeError);
      return json({ error: "Failed to save email" }, 500);
    }

    const mail = confirmationEmail(`${safeRedirectOrigin(req)}/email-updates#confirm=${token}`);
    const sent = await sendEmail({ to: parsed.email, ...mail });
    if (!sent.ok) {
      // No confirmation went out: put the row back as it was, or remove it if it
      // was new, so an earlier link keeps working. Scoped to this call's hash,
      // so a concurrent signup's write survives.
      const undo = existing
        ? adminClient
            .from("email_signups")
            .update({
              source: existing.source,
              confirm_token_hash: existing.confirm_token_hash,
              confirm_sent_at: existing.confirm_sent_at,
              confirm_send_count: existing.confirm_send_count,
              confirm_email_version: existing.confirm_email_version,
            })
            .eq("email", parsed.email)
            .eq("confirm_token_hash", hash)
        : adminClient.from("email_signups").delete().eq("email", parsed.email).eq("confirm_token_hash", hash);
      const { error: undoError } = await undo;
      if (undoError) console.error("email-signup undo error:", undoError);
      console.error("email-signup send failed:", sent.reason);
      return json({ error: "Failed to send confirmation" }, 502);
    }

    return json(OK);
  } catch (err) {
    console.error("email-signup error:", err);
    return json({ error: "Internal server error" }, 500);
  }
});
