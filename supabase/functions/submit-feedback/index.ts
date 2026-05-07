import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { escapeHtml, sendEmail } from "../_shared/email.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

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

    const { type, message } = await req.json();

    if (!type || !message) {
      return new Response(JSON.stringify({ error: "Missing type or message" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const validTypes = ["feature", "improvement", "bug"];
    if (!validTypes.includes(type)) {
      return new Response(JSON.stringify({ error: "Invalid feedback type" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (typeof message !== "string" || message.trim().length === 0 || message.length > 2000) {
      return new Response(JSON.stringify({ error: "Message must be 1-2000 characters" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Extract user if authenticated
    const authHeader = req.headers.get("authorization");
    let userId: string | null = null;
    let userEmail: string | null = null;

    if (authHeader) {
      try {
        const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
        const userClient = createClient(supabaseUrl, anonKey, {
          global: { headers: { authorization: authHeader } },
        });
        const { data: { user } } = await userClient.auth.getUser();
        if (user) {
          userId = user.id;
          userEmail = user.email ?? null;
        }
      } catch (e) {
        console.warn("Could not extract user from auth header:", e);
      }
    }

    const { error: insertError } = await adminClient
      .from("feedback")
      .insert({
        user_id: userId,
        type: type.trim(),
        message: message.trim(),
      });

    if (insertError) {
      console.error("Insert error:", insertError);
      return new Response(JSON.stringify({ error: "Failed to store feedback" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await sendFeedbackEmail({
      type: type.trim(),
      message: message.trim(),
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
