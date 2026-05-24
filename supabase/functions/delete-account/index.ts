import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { brandedEmailHtml, escapeHtml, sendEmail } from "../_shared/email.ts";
import { buildCorsHeaders, corsPreflightResponse } from "../_shared/cors.ts";
import { checkRateLimit, extractIp } from "../_shared/rateLimit.ts";
import { cancelActiveSubscriptions, isFullyCancelled } from "../_shared/cancelStripeSubscriptions.ts";
import { deleteUserData } from "../_shared/userDataDelete.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflightResponse(req);
  const corsHeaders = buildCorsHeaders(req);

  const errorResponse = (code: string, status: number, extraHeaders: Record<string, string> = {}) =>
    new Response(JSON.stringify({ error: code }), {
      headers: { ...corsHeaders, "Content-Type": "application/json", ...extraHeaders },
      status,
    });

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: req.headers.get("Authorization")! } } }
    );

    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    // Account-deletion is a destructive single-shot per session — 5 attempts
    // per minute per IP is more than enough for a real user and blocks the
    // obvious abuse case of scripted mass-deletion against stolen tokens.
    const ip = extractIp(req);
    const rate = await checkRateLimit(serviceClient, { ip, bucket: "delete-account", maxRequests: 5, windowSeconds: 60 });
    if (!rate.allowed) {
      return errorResponse("rate_limited", 429, { "Retry-After": String(rate.retryAfter) });
    }

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      return errorResponse("unauthenticated", 401);
    }

    // Cancel any live Stripe subscriptions before dropping the user row.
    // Without this, a self-deleted Pro user keeps getting billed and the
    // webhook can no longer reconcile state to a missing profile. We
    // fail-closed: if Stripe is unreachable or any cancel fails, the
    // deletion aborts so the user can retry rather than silently leaking
    // a paying subscription.
    //
    // We need the stripe_customer_id from `profiles` BEFORE we run
    // deleteUserData, which removes the profile row.
    const { data: profile, error: profileErr } = await serviceClient
      .from("profiles")
      .select("stripe_customer_id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (profileErr) {
      console.error("[delete-account] profile lookup failed:", profileErr);
      return errorResponse("internal_error", 500);
    }
    const customerId = (profile?.stripe_customer_id as string | null | undefined) ?? null;

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (customerId && stripeKey) {
      try {
        const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
        const cancelResult = await cancelActiveSubscriptions(stripe, customerId);
        if (!isFullyCancelled(cancelResult)) {
          console.error(
            "[delete-account] Stripe cancellation incomplete:",
            JSON.stringify(cancelResult.errors),
          );
          return errorResponse("stripe_cancel_failed", 500);
        }
        if (cancelResult.cancelled.length > 0) {
          console.log(
            `[delete-account] cancelled ${cancelResult.cancelled.length} sub(s) for ${customerId}: ${cancelResult.cancelled.join(", ")}`,
          );
        }
      } catch (e) {
        console.error("[delete-account] Stripe list/cancel threw:", e);
        return errorResponse("stripe_cancel_failed", 500);
      }
    } else if (customerId && !stripeKey) {
      // A profile has a Stripe customer ID but we have no Stripe key to
      // cancel with. Refuse the delete — silently dropping the user would
      // strand the subscription.
      console.error("[delete-account] customer present but STRIPE_SECRET_KEY missing — refusing delete");
      return errorResponse("server_misconfigured", 500);
    }

    // Clear user-scoped rows before dropping auth.users. The list of tables
    // and their order live in userDataDelete.ts so the same sequence can be
    // unit-tested and reused by the admin-side delete path.
    //
    // Abort if any table-level delete failed. The auth.users row stays so
    // the user (or admin) can retry — silently removing the account would
    // orphan rows in tables that are ON DELETE SET NULL (e.g. feedback),
    // defeating the GDPR-intent delete.
    const cleanup = await deleteUserData(serviceClient, user.id);
    if (cleanup.errors.length > 0) {
      console.error(
        `[delete-account] data cleanup partial-failure for ${user.id}:`,
        JSON.stringify(cleanup.errors),
      );
      return errorResponse("cleanup_failed", 500);
    }

    // Capture identifiers before deletion — they're needed for the emails.
    const deletedUserId = user.id;
    const deletedUserEmail = user.email ?? null;

    // Delete the auth user (this cascades but we cleaned up first)
    const { error: deleteError } = await serviceClient.auth.admin.deleteUser(user.id);
    if (deleteError) {
      console.error("Error deleting user:", deleteError);
      return errorResponse("delete_failed", 500);
    }

    // Fire-and-forget — email failures must not affect the deletion result.
    await Promise.allSettled([
      sendUserDeletionConfirmation(deletedUserEmail),
      sendAdminDeletionAlert(deletedUserId, deletedUserEmail),
    ]);

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (err) {
    console.error("delete-account error:", err);
    return errorResponse("internal_error", 500);
  }
});

async function sendUserDeletionConfirmation(email: string | null) {
  if (!email) return;
  const bodyHtml = `
    <p style="margin: 0 0 16px;">We've removed your account and all associated data. There's nothing left for you to do.</p>
    <p style="margin: 0 0 16px;">If this wasn't you, or you'd like to share why you left, just reply to this email — we read every response.</p>
    <p style="margin: 0;">Thanks for trying Quantive.</p>
  `;
  const html = brandedEmailHtml({ heading: "Your Quantive account has been deleted", bodyHtml });
  const text =
    "Your Quantive account has been deleted.\n\n" +
    "We've removed your account and all associated data. There's nothing left for you to do.\n\n" +
    "If this wasn't you, or you'd like to share why you left, just reply to this email — we read every response.\n\n" +
    "Thanks for trying Quantive.";

  await sendEmail({
    to: email,
    subject: "Your Quantive account has been deleted",
    html,
    text,
    replyTo: Deno.env.get("DELETE_REPLY_TO_EMAIL") || "hello@usequantive.app",
  });
}

async function sendAdminDeletionAlert(userId: string, email: string | null) {
  const to = Deno.env.get("DELETE_NOTIFY_TO_EMAIL") || "hello@usequantive.app";
  const html = `
    <div style="font-family: ui-sans-serif, system-ui, sans-serif; max-width: 560px;">
      <h2 style="margin: 0 0 12px;">Account deleted</h2>
      ${email ? `<p style="margin: 0 0 4px;"><strong>Email:</strong> ${escapeHtml(email)}</p>` : ""}
      <p style="margin: 0 0 4px;"><strong>User ID:</strong> <code>${escapeHtml(userId)}</code></p>
      <p style="margin: 12px 0 0; color: #6b7280; font-size: 13px;">Consider reaching out to ask why — early-stage churn signal.</p>
    </div>
  `;
  const text = `Account deleted\n\nEmail: ${email ?? "(none)"}\nUser ID: ${userId}`;

  await sendEmail({
    to,
    subject: `Quantive account deleted: ${email ?? userId}`,
    html,
    text,
    replyTo: email,
  });
}
