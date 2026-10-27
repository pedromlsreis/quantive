// Confirms or unsubscribes an address on the "Keep me posted" list, from the
// links in the confirmation email (email-signup) and in every update email.
// Unauthenticated (verify_jwt = false): the token in the link is the credential.
// Both actions append to email_consent_events, the proof of consent that
// outlives the signup row.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildCorsHeaders, corsPreflightResponse } from "../_shared/cors.ts";
import {
  confirmVerdict,
  emailHmac,
  isConfirmToken,
  isUnsubscribeToken,
  sha256Hex,
} from "../_shared/emailList.ts";
import { checkRateLimit, extractIp } from "../_shared/rateLimit.ts";

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
      return json({ error: "server_error" }, 500);
    }
    const admin = createClient(supabaseUrl, serviceRoleKey);
    const hmacKey = Deno.env.get("EMAIL_CONSENT_HMAC_KEY");

    const ip = extractIp(req);
    const rate = await checkRateLimit(admin, { ip, bucket: "email-list", maxRequests: 10, windowSeconds: 60 });
    if (!rate.allowed) return json({ error: "rate_limited" }, 429, { "Retry-After": String(rate.retryAfter) });

    const body = (await req.json().catch(() => null)) as { action?: unknown; token?: unknown } | null;

    if (body?.action === "confirm" && isConfirmToken(body.token)) {
      const { data: row, error } = await admin
        .from("email_signups")
        .select("id, email, created_at, confirmed_at, confirm_sent_at, confirm_email_version")
        .eq("confirm_token_hash", await sha256Hex(body.token))
        .maybeSingle();
      if (error) throw error;

      const verdict = confirmVerdict(row, new Date());
      // Unknown, or replaced by a newer link.
      if (!row || verdict === "invalid") return json({ error: "invalid_link" }, 404);
      if (verdict === "already") return json({ success: true });
      if (verdict === "expired") return json({ error: "expired" }, 410);

      // Consent is recorded before it takes effect, so a confirmed row always has its proof.
      if (!hmacKey) {
        console.error("email-list: EMAIL_CONSENT_HMAC_KEY is not set; not confirming");
        return json({ error: "server_error" }, 500);
      }
      const confirmedAt = new Date().toISOString();
      const hmac = await emailHmac(row.email, hmacKey);
      const { error: logError } = await admin.from("email_consent_events").insert({
        email_hmac: hmac,
        event: "confirmed",
        occurred_at: confirmedAt,
        signed_up_at: row.created_at,
        confirm_sent_at: row.confirm_sent_at,
        // The version email-signup sent this link in, not this deployment's.
        email_version: row.confirm_email_version,
      });
      if (logError) throw logError;

      // The hash on the row keeps the consent record from being purged while
      // the address stays subscribed.
      const { error: updateError } = await admin
        .from("email_signups")
        .update({ confirmed_at: confirmedAt, email_hmac: hmac })
        .eq("id", row.id);
      if (updateError) throw updateError;
      return json({ success: true });
    }

    if (body?.action === "unsubscribe" && isUnsubscribeToken(body.token)) {
      // Deleting the row is the unsubscribe; for a confirmed address the same
      // SQL statement records the 'unsubscribed' event (migration 20261025120000).
      // The answer is the same whether or not the token matched, so a link
      // can't be used to probe the list.
      const { error } = await admin.rpc("email_list_unsubscribe", { p_token: body.token });
      if (error) throw error;
      return json({ success: true });
    }

    return json({ error: "invalid_link" }, 400);
  } catch (err) {
    console.error("email-list error:", err);
    return json({ error: "server_error" }, 500);
  }
});
