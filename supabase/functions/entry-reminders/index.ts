// entry-reminders — daily cron that emails users who asked to be nudged to
// update their balances and have gone a full cadence without syncing.
//
// Privacy: the decision uses only profiles.reminder_frequency and
// portfolio_snapshots.updated_at (the last sync time, which the server already
// stores). It never reads encrypted_data. No portfolio plaintext is involved.
//
// Auth: same shared CRON_SECRET as fx-ingest / benchmark-ingest. Not browser-
// callable, so no CORS handling here.

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { brandedEmailHtml, escapeHtml, sendEmail } from "../_shared/email.ts";
import {
  cadenceLabel,
  isReminderDue,
  isReminderFrequency,
  type ReminderFrequency,
} from "./reminders.ts";

const log = (step: string, details?: unknown) => {
  const d = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[entry-reminders] ${step}${d}`);
};

interface CandidateRow {
  user_id: string;
  reminder_frequency: string | null;
  reminder_last_sent_at: string | null;
  display_name: string | null;
}

function buildEmail(args: { displayName: string | null; frequency: ReminderFrequency }) {
  const { displayName, frequency } = args;
  const greeting = displayName ? `Hi ${escapeHtml(displayName.split(" ")[0])},` : "Hi,";
  const cadence = cadenceLabel(frequency);

  const bodyHtml = `
    <p style="margin: 0 0 16px;">${greeting}</p>
    <p style="margin: 0 0 16px;">It has been a while since you last updated your balances on Quantive. A quick update keeps your net worth history and charts accurate, and it only takes a minute.</p>
    <p style="margin: 0 0 16px;"><a href="https://usequantive.app/dashboard" style="color: #111; font-weight: 600;">Update your balances</a></p>
    <p style="margin: 0 0 16px;">You asked to be reminded ${cadence}. You can change how often, or turn reminders off, in <a href="https://usequantive.app/settings" style="color: #111;">Settings</a>.</p>
    <p style="margin: 0 0 4px;">Thanks,</p>
    <p style="margin: 0;">Pedro · Quantive</p>
  `;
  const html = brandedEmailHtml({ heading: "Time to update your balances", bodyHtml });

  const text =
    `Time to update your balances\n\n` +
    `${displayName ? `Hi ${displayName.split(" ")[0]},` : "Hi,"}\n\n` +
    `It has been a while since you last updated your balances on Quantive. A quick update keeps your net worth history and charts accurate, and it only takes a minute.\n\n` +
    `Update your balances: https://usequantive.app/dashboard\n\n` +
    `You asked to be reminded ${cadence}. You can change how often, or turn reminders off, in Settings: https://usequantive.app/settings\n\n` +
    `Thanks,\nPedro · Quantive`;

  return { html, text };
}

serve(async (req) => {
  try {
    const expected = Deno.env.get("CRON_SECRET");
    if (!expected) throw new Error("CRON_SECRET is not set");
    const auth = req.headers.get("Authorization");
    if (auth !== `Bearer ${expected}`) {
      return new Response("Unauthorized", { status: 401 });
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } },
    );

    // Only rows with a real cadence are candidates. NULL / 'off' are excluded
    // at the query so we never load the whole table.
    const { data: candidates, error: candErr } = await admin
      .from("profiles")
      .select("user_id, reminder_frequency, reminder_last_sent_at, display_name")
      .in("reminder_frequency", ["monthly", "quarterly", "biannual"]);
    if (candErr) throw candErr;

    const now = new Date();
    let checked = 0;
    let sent = 0;
    let skipped = 0;

    for (const row of (candidates ?? []) as CandidateRow[]) {
      checked++;
      const frequency = row.reminder_frequency;
      if (!isReminderFrequency(frequency)) {
        skipped++;
        continue;
      }

      // Last sync time — the only activity signal we have, and one the server
      // already knows. No snapshot row means the user never entered data, so
      // there is nothing to remind them to update.
      const { data: snap, error: snapErr } = await admin
        .from("portfolio_snapshots")
        .select("updated_at")
        .eq("user_id", row.user_id)
        .maybeSingle();
      if (snapErr) {
        log("snapshot lookup failed", { user: row.user_id, error: snapErr.message });
        skipped++;
        continue;
      }

      const due = isReminderDue({
        frequency,
        lastActivityAt: snap?.updated_at ?? null,
        lastSentAt: row.reminder_last_sent_at,
        now,
      });
      if (!due) {
        skipped++;
        continue;
      }

      // Resolve the email lazily, only for users we actually intend to nudge.
      const { data: userData, error: userErr } = await admin.auth.admin.getUserById(row.user_id);
      const user = userData?.user;
      if (userErr || !user?.email || !user.email_confirmed_at) {
        skipped++;
        continue;
      }

      const { html, text } = buildEmail({ displayName: row.display_name, frequency });

      const result = await sendEmail({
        to: user.email,
        subject: "Time to update your balances",
        html,
        text,
        replyTo: Deno.env.get("FOUNDER_REPLY_TO_EMAIL") || "hello@usequantive.app",
      });

      if (!result.ok) {
        log("send failed", { user: row.user_id, reason: result.reason });
        skipped++;
        continue;
      }

      // Stamp the send so we do not nudge again until a full interval passes.
      const { error: stampErr } = await admin
        .from("profiles")
        .update({ reminder_last_sent_at: now.toISOString() })
        .eq("user_id", row.user_id);
      if (stampErr) {
        // The email already went out; a failed stamp would risk a duplicate on
        // the next run. Log loudly but count it as sent.
        log("stamp failed after send", { user: row.user_id, error: stampErr.message });
      }
      sent++;
    }

    log("done", { checked, sent, skipped });
    return new Response(
      JSON.stringify({ ok: true, checked, sent, skipped }),
      { headers: { "Content-Type": "application/json" }, status: 200 },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log("ERROR", { message: msg });
    return new Response(JSON.stringify({ error: msg }), {
      headers: { "Content-Type": "application/json" },
      status: 500,
    });
  }
});
