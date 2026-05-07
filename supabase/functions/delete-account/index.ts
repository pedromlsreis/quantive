import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { escapeHtml, sendEmail } from "../_shared/email.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: req.headers.get("Authorization")! } } }
    );

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 401,
      });
    }

    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    // Delete portfolio snapshots
    await serviceClient.from("portfolio_snapshots").delete().eq("user_id", user.id);

    // Delete feedback
    await serviceClient.from("feedback").delete().eq("user_id", user.id);

    // Delete profile
    await serviceClient.from("profiles").delete().eq("user_id", user.id);

    // Capture identifiers before deletion — they're needed for the emails.
    const deletedUserId = user.id;
    const deletedUserEmail = user.email ?? null;

    // Delete the auth user (this cascades but we cleaned up first)
    const { error: deleteError } = await serviceClient.auth.admin.deleteUser(user.id);
    if (deleteError) {
      console.error("Error deleting user:", deleteError);
      return new Response(JSON.stringify({ error: "Failed to delete account" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      });
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
    return new Response(JSON.stringify({ error: err.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});

async function sendUserDeletionConfirmation(email: string | null) {
  if (!email) return;
  const html = `
    <div style="font-family: ui-sans-serif, system-ui, sans-serif; max-width: 560px;">
      <h2 style="margin: 0 0 12px;">Your Quantive account has been deleted</h2>
      <p style="margin: 0 0 12px;">We've removed your account and all associated data. There's nothing left for you to do.</p>
      <p style="margin: 0 0 12px;">If this wasn't you, or you'd like to share why you left, just reply to this email — we read every response.</p>
      <p style="margin: 0;">Thanks for trying Quantive.</p>
    </div>
  `;
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
