import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildCorsHeaders, corsPreflightResponse } from "../_shared/cors.ts";
import { checkRateLimit, extractIp } from "../_shared/rateLimit.ts";
import { verifyTurnstile } from "../_shared/turnstile.ts";
import { parseEmailSignupBody } from "./validation.ts";

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

    // Verify Turnstile. Skipped only when TURNSTILE_SECRET_KEY is unset (dev /
    // pre-enable); enforced once the secret is configured.
    const captcha = await verifyTurnstile(parsed.token, ip);
    if (!captcha.ok) return json({ error: "Captcha verification failed" }, 403);

    // Upsert: a repeat address is a no-op, never an error back to the visitor.
    const { error: insertError } = await adminClient
      .from("email_signups")
      .upsert(
        { email: parsed.email, source: parsed.source },
        { onConflict: "email", ignoreDuplicates: true },
      );

    if (insertError) {
      console.error("email-signup insert error:", insertError);
      return json({ error: "Failed to save email" }, 500);
    }

    return json({ success: true });
  } catch (err) {
    console.error("email-signup error:", err);
    return json({ error: "Internal server error" }, 500);
  }
});
