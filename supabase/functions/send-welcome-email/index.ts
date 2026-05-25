// Sends the Quantive welcome email once per user, after their email is
// confirmed. The client calls this on every authenticated session start;
// idempotency is enforced server-side via profiles.welcome_email_sent_at
// so a duplicate call returns { skipped: "already_sent" } instead of
// re-sending.

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { brandedEmailHtml, escapeHtml, sendEmail } from "../_shared/email.ts";
import { buildCorsHeaders, corsPreflightResponse } from "../_shared/cors.ts";
import { checkRateLimit, extractIp } from "../_shared/rateLimit.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflightResponse(req);
  const corsHeaders = buildCorsHeaders(req);

  const respond = (body: Record<string, unknown>, status = 200, extraHeaders: Record<string, string> = {}) =>
    new Response(JSON.stringify(body), {
      headers: { ...corsHeaders, "Content-Type": "application/json", ...extraHeaders },
      status,
    });

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } },
    );

    // Throttle per source IP. The client calls this on every authenticated
    // session start; the welcome_email_sent_at flag makes that idempotent
    // for legitimate users, but a malicious authed caller could still spam
    // invocations to burn Resend quota and log noise. 5/minute is plenty
    // of headroom for a real login (typically 1 per session).
    const ip = extractIp(req);
    const rate = await checkRateLimit(admin, { ip, bucket: "send-welcome-email", maxRequests: 5, windowSeconds: 60 });
    if (!rate.allowed) {
      return respond({ error: "rate_limited" }, 429, { "Retry-After": String(rate.retryAfter) });
    }

    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "").trim();
    if (!token) return respond({ error: "unauthenticated" }, 401);

    const { data: userData, error: userError } = await admin.auth.getUser(token);
    const user = userData.user;
    if (userError || !user) return respond({ error: "unauthenticated" }, 401);
    if (!user.email) return respond({ skipped: "no_email" });
    if (!user.email_confirmed_at) return respond({ skipped: "email_unverified" });

    // Atomically CLAIM the welcome-send slot before sending. The previous
    // pattern (read flag → send → write flag) had a race window: two tabs
    // hitting the function in parallel both read NULL, both sent, both
    // wrote the flag. Common with new signups because the confirmation
    // email link opens a second tab, so the original signup tab + the new
    // tab + a stray Settings tab all fire on the same SIGNED_IN event.
    //
    // Conditional UPDATE with `.is("welcome_email_sent_at", null)` flips the
    // flag if it is still null and returns the row only on the winning
    // claim. Losers see an empty result and short-circuit.
    const claimedAt = new Date().toISOString();
    const { data: claim, error: claimErr } = await admin
      .from("profiles")
      .update({ welcome_email_sent_at: claimedAt })
      .eq("user_id", user.id)
      .is("welcome_email_sent_at", null)
      .select("display_name");

    if (claimErr) {
      console.error("[send-welcome-email] claim failed:", claimErr.message);
      return respond({ error: "internal_error" }, 500);
    }
    if (!claim || claim.length === 0) {
      return respond({ skipped: "already_sent" });
    }
    const claimedProfile = claim[0] as { display_name: string | null };

    const greeting = claimedProfile.display_name
      ? `Hi ${escapeHtml(claimedProfile.display_name.split(" ")[0])},`
      : "Hi,";

    const bodyHtml = `
      <p style="margin: 0 0 16px;">${greeting}</p>
      <p style="margin: 0 0 16px;">Thanks for signing up. Quantive is a personal net worth tracker that keeps your data end-to-end encrypted in your browser — the server can't read it, and neither can I.</p>
      <p style="margin: 0 0 12px;">A few things that might help you get going:</p>
      <ul style="margin: 0 0 16px; padding-left: 20px;">
        <li style="margin-bottom: 6px;"><strong>Add your accounts</strong> from the dashboard, or import an existing spreadsheet. <a href="https://usequantive.app/dashboard" style="color: #111;">Open the dashboard</a>.</li>
        <li style="margin-bottom: 6px;"><strong>Set up a recovery code</strong> in <a href="https://usequantive.app/settings" style="color: #111;">Settings</a>. Quantive's encryption is real, which means if you forget your password and have no recovery code, your data is genuinely gone — by design.</li>
        <li><strong>The free tier is forever</strong>. <a href="https://usequantive.app/pricing" style="color: #111;">Pro</a> (€9/month or €90/year) adds forecasting, full history, milestones, benchmarks, and exports if and when you want them.</li>
      </ul>
      <p style="margin: 0 0 16px;">If anything is unclear or broken, reply to this email — it goes straight to me.</p>
      <p style="margin: 0 0 4px;">Thanks,</p>
      <p style="margin: 0;">Pedro · Quantive</p>
    `;
    const html = brandedEmailHtml({ heading: "Welcome to Quantive", bodyHtml });
    const text =
      `Welcome to Quantive\n\n` +
      `${claimedProfile.display_name ? `Hi ${claimedProfile.display_name.split(" ")[0]},` : "Hi,"}\n\n` +
      `Thanks for signing up. Quantive is a personal net worth tracker that keeps your data end-to-end encrypted in your browser — the server can't read it, and neither can I.\n\n` +
      `A few things that might help you get going:\n` +
      `- Add your accounts from the dashboard, or import an existing spreadsheet: https://usequantive.app/dashboard\n` +
      `- Set up a recovery code in Settings (https://usequantive.app/settings). Quantive's encryption is real — if you forget your password and have no recovery code, your data is genuinely gone by design.\n` +
      `- The free tier is forever. Pro (https://usequantive.app/pricing) adds forecasting, full history, milestones, benchmarks, and exports if and when you want them.\n\n` +
      `If anything is unclear or broken, reply to this email — it goes straight to me.\n\n` +
      `Thanks,\nPedro · Quantive`;

    const result = await sendEmail({
      to: user.email,
      subject: "Welcome to Quantive",
      html,
      text,
      replyTo: Deno.env.get("FOUNDER_REPLY_TO_EMAIL") || "hello@usequantive.app",
    });

    if (!result.ok) {
      // Send failed — release the claim so the next session can retry.
      // We don't want a transient Resend outage to permanently swallow the
      // welcome email. Race-safe because the release is unconditional: if
      // a parallel caller somehow claimed in between (impossible given the
      // conditional UPDATE above, but defensive), the worst case is that
      // their successful send also gets re-claimed by yet another caller.
      console.error("[send-welcome-email] sendEmail failed:", result.reason);
      const { error: releaseErr } = await admin
        .from("profiles")
        .update({ welcome_email_sent_at: null })
        .eq("user_id", user.id);
      if (releaseErr) {
        console.error("[send-welcome-email] claim release failed:", releaseErr.message);
      }
      return respond({ error: "send_failed" }, 502);
    }

    return respond({ sent: true });
  } catch (e) {
    console.error("[send-welcome-email] unexpected error:", e);
    return respond({ error: "internal_error" }, 500);
  }
});
