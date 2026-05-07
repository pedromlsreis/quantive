// Triggered by a Supabase database webhook on INSERT into auth.users.
// Emails the admin about new signups until total users exceed the threshold.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { escapeHtml, sendEmail } from "../_shared/email.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-webhook-secret",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  // Shared-secret check so only the configured DB webhook can invoke this.
  const expectedSecret = Deno.env.get("SIGNUP_WEBHOOK_SECRET");
  if (expectedSecret) {
    const provided = req.headers.get("x-webhook-secret");
    if (provided !== expectedSecret) {
      return new Response("Unauthorized", { status: 401, headers: corsHeaders });
    }
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) {
      console.error("[notify-signup] Missing env vars");
      return new Response("Server misconfigured", { status: 500, headers: corsHeaders });
    }

    const payload = await req.json().catch(() => null);
    const record = payload?.record;
    if (!record?.id) {
      console.warn("[notify-signup] Missing record.id in payload");
      return jsonOk({ skipped: "no_record" });
    }

    const threshold = Number(Deno.env.get("SIGNUP_NOTIFY_THRESHOLD") ?? "15");

    const service = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    // Cheap cap check: list one page sized threshold+1. If we get more than
    // threshold rows back, we've already crossed the line — skip the email.
    const { data: list, error: listErr } = await service.auth.admin.listUsers({
      page: 1,
      perPage: threshold + 1,
    });
    if (listErr) {
      console.error("[notify-signup] listUsers failed:", listErr);
    } else if ((list?.users?.length ?? 0) > threshold) {
      console.log(
        `[notify-signup] Skipping — user count > ${threshold}`,
      );
      return jsonOk({ skipped: "threshold" });
    }

    await sendSignupEmail({
      userId: record.id as string,
      email: (record.email as string | null | undefined) ?? null,
      createdAt: (record.created_at as string | null | undefined) ?? null,
      userCount: list?.users?.length ?? null,
    });

    return jsonOk({ ok: true });
  } catch (err) {
    console.error("[notify-signup] error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function jsonOk(body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function sendSignupEmail(params: {
  userId: string;
  email: string | null;
  createdAt: string | null;
  userCount: number | null;
}) {
  const { userId, email, createdAt, userCount } = params;
  const to = Deno.env.get("SIGNUP_NOTIFY_TO_EMAIL") || "hello@usequantive.app";
  const countLabel = userCount !== null ? ` (#${userCount})` : "";
  const subject = `New Quantive signup${countLabel}: ${email ?? userId}`;

  const html = `
    <div style="font-family: ui-sans-serif, system-ui, sans-serif; max-width: 560px;">
      <h2 style="margin: 0 0 12px;">New Quantive signup</h2>
      ${email ? `<p style="margin: 0 0 4px;"><strong>Email:</strong> ${escapeHtml(email)}</p>` : ""}
      <p style="margin: 0 0 4px;"><strong>User ID:</strong> <code>${escapeHtml(userId)}</code></p>
      ${createdAt ? `<p style="margin: 0 0 4px;"><strong>Created:</strong> ${escapeHtml(createdAt)}</p>` : ""}
      ${userCount !== null ? `<p style="margin: 0 0 4px;"><strong>Total users now:</strong> ${userCount}</p>` : ""}
    </div>
  `;

  const text = `New Quantive signup\n\nEmail: ${email ?? "(none)"}\nUser ID: ${userId}\nCreated: ${createdAt ?? "(unknown)"}${userCount !== null ? `\nTotal users now: ${userCount}` : ""}`;

  await sendEmail({ to, subject, html, text, replyTo: email });
}
