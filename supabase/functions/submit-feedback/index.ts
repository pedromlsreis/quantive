import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { escapeHtml, sendEmail } from "../_shared/email.ts";
import { buildCorsHeaders, corsPreflightResponse } from "../_shared/cors.ts";
import { parseFeedbackBody } from "./validation.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflightResponse(req);
  const corsHeaders = buildCorsHeaders(req);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceRoleKey) {
      console.error("Missing env vars", { hasUrl: !!supabaseUrl, hasKey: !!serviceRoleKey });
      return new Response(JSON.stringify({ error: "Server configuration error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Rate limiting — check before parsing body
    const ip =
      req.headers.get("CF-Connecting-IP") ||
      req.headers.get("X-Forwarded-For")?.split(",")[0].trim() ||
      "unknown";

    const { data: allowed, error: rlError } = await adminClient.rpc("check_rate_limit", {
      p_ip: ip,
    });

    if (rlError) {
      console.error("[RATE_LIMIT] Check failed:", rlError);
      // Fail open to avoid blocking legitimate users on DB errors
    } else if (!allowed) {
      console.warn(`[RATE_LIMIT] Rejected ip=${ip} at=${new Date().toISOString()}`);
      return new Response(JSON.stringify({ error: "Too many requests" }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json", "Retry-After": "60" },
      });
    }

    const rawBody = await req.json().catch(() => null);
    const parsed = parseFeedbackBody(rawBody);
    if (!parsed.ok) {
      return new Response(JSON.stringify({ error: parsed.error }), {
        status: parsed.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { type, message } = parsed;

    // Extract user if authenticated
    const authHeader = req.headers.get("authorization");
    let userId: string | null = null;
    let userEmail: string | null = null;

    if (authHeader) {
      // Pass the JWT directly to getUser(token) — the older pattern of
      // `createClient(..., { global: { headers: { authorization } } })` and
      // calling `getUser()` is flaky: supabase-js layers its own
      // `Authorization: Bearer <anon_key>` on top, shadowing the user JWT in
      // some header-case combinations and returning a null user even when
      // the caller is authenticated.
      try {
        const jwt = authHeader.replace(/^Bearer\s+/i, "").trim();
        if (jwt) {
          const { data: { user }, error: getUserErr } = await adminClient.auth.getUser(jwt);
          if (getUserErr) {
            console.warn("[feedback] getUser failed:", getUserErr.message);
          } else if (user) {
            userId = user.id;
            userEmail = user.email ?? null;
          } else {
            // No user resolved: typically the supabase-js client attached
            // `Authorization: Bearer <anon_key>` for an unauthenticated call.
            console.warn("[feedback] auth header present but token resolves to no user (anon or expired)");
          }
        }
      } catch (e) {
        console.warn("[feedback] Could not extract user from auth header:", e);
      }
    }

    console.log(`[feedback] inserting type=${type} userId=${userId ?? "null"} authHeader=${authHeader ? "present" : "absent"}`);

    const { error: insertError } = await adminClient
      .from("feedback")
      .insert({
        user_id: userId,
        type,
        message,
      });

    if (insertError) {
      console.error("Insert error:", insertError);
      return new Response(JSON.stringify({ error: "Failed to store feedback" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await sendFeedbackEmail({
      type,
      message,
      userId,
      userEmail,
    });

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Feedback error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function sendFeedbackEmail(params: {
  type: string;
  message: string;
  userId: string | null;
  userEmail: string | null;
}) {
  const { type, message, userId, userEmail } = params;
  const to = Deno.env.get("FEEDBACK_TO_EMAIL") || "hello@usequantive.app";
  const fromLabel = userEmail ?? (userId ? `user ${userId}` : "anonymous");
  const subject = `[Feedback · ${type}] ${message.slice(0, 80)}${message.length > 80 ? "…" : ""}`;

  const html = `
    <div style="font-family: ui-sans-serif, system-ui, sans-serif; max-width: 560px;">
      <h2 style="margin: 0 0 12px;">New Quantive feedback</h2>
      <p style="margin: 0 0 4px;"><strong>Type:</strong> ${escapeHtml(type)}</p>
      <p style="margin: 0 0 4px;"><strong>From:</strong> ${escapeHtml(fromLabel)}</p>
      ${userId ? `<p style="margin: 0 0 4px;"><strong>User ID:</strong> <code>${escapeHtml(userId)}</code></p>` : ""}
      <hr style="margin: 16px 0; border: none; border-top: 1px solid #e5e7eb;" />
      <pre style="white-space: pre-wrap; font-family: inherit; margin: 0;">${escapeHtml(message)}</pre>
    </div>
  `;

  const text = `New Quantive feedback\n\nType: ${type}\nFrom: ${fromLabel}${userId ? `\nUser ID: ${userId}` : ""}\n\n${message}`;

  await sendEmail({ to, subject, html, text, replyTo: userEmail });
}
