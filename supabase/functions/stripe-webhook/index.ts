// Receives Stripe webhook events. Three jobs:
//   1. Idempotency — insert (event_id) into stripe_events first; a duplicate
//      delivery sees the conflict and we return 200 without re-running.
//   2. Cache the subscription state on profiles so check-subscription does
//      not need a live Stripe call on every dashboard load.
//   3. Send transactional emails: admin notifications (always) plus the
//      Pro receipt + onboarding email to the customer on first activation.
//
// Stripe webhook signing secret must be set as STRIPE_WEBHOOK_SECRET.

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { brandedEmailHtml, escapeHtml, sendEmail } from "../_shared/email.ts";
import { buildCacheRow } from "../_shared/subscriptionCache.ts";
import { formatCancellationReason } from "./cancellationReason.ts";
import { decideIdempotencyOutcome } from "./idempotency.ts";
import { cancellationTransition } from "./transitions.ts";

const HANDLED_EVENTS = new Set([
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.payment_failed",
]);

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  if (!stripeKey || !webhookSecret) {
    console.error("[stripe-webhook] Missing STRIPE_SECRET_KEY or STRIPE_WEBHOOK_SECRET");
    return new Response("Server misconfigured", { status: 500 });
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) return new Response("Missing signature", { status: 400 });

  const body = await req.text();
  const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[stripe-webhook] Signature verification failed:", msg);
    return new Response(`Webhook Error: ${msg}`, { status: 400 });
  }

  if (!HANDLED_EVENTS.has(event.type)) {
    return new Response(JSON.stringify({ received: true, skipped: event.type }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } },
  );

  // Idempotency. INSERT ... ON CONFLICT DO NOTHING — if Stripe re-delivers
  // the same event (network blip, retry, replay), we see no rows inserted
  // and skip the handler. We still 200 so Stripe stops retrying.
  const insertResult = await admin
    .from("stripe_events")
    .insert({ event_id: event.id, event_type: event.type })
    .select("event_id");

  const outcome = decideIdempotencyOutcome({
    data: insertResult.data as Array<{ event_id: string }> | null,
    error: insertResult.error as { code?: string; message?: string } | null,
  });

  if (outcome.kind === "duplicate") {
    console.log(
      `[stripe-webhook] duplicate event ${event.id} (${event.type}) reason=${outcome.reason} — skipping`,
    );
    return new Response(JSON.stringify({ received: true, duplicate: true }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  if (outcome.kind === "error") {
    // A real DB failure — return 500 so Stripe retries with backoff. Better
    // a retried delivery than a silently-dropped subscription event.
    console.error(`[stripe-webhook] stripe_events insert failed:`, insertResult.error);
    return new Response(JSON.stringify({ error: "idempotency_check_failed" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    await handleEvent(stripe, admin, event);
  } catch (e) {
    // A handler failure now means real DB work didn't happen. Return 500
    // so Stripe retries the delivery — the idempotency row we just inserted
    // would block the retry, so roll it back first.
    console.error(`[stripe-webhook] Handler failed for ${event.type}:`, e);
    await admin.from("stripe_events").delete().eq("event_id", event.id);
    return new Response(JSON.stringify({ error: "handler_failed" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { "Content-Type": "application/json" },
  });
});

type AdminClient = ReturnType<typeof createClient>;

async function handleEvent(stripe: Stripe, admin: AdminClient, event: Stripe.Event) {
  const adminTo = Deno.env.get("STRIPE_NOTIFY_TO_EMAIL") || "hello@usequantive.app";

  switch (event.type) {
    case "checkout.session.completed": {
      // Insurance against `customer.subscription.created` arriving late or
      // out of order. We resolve the subscription and refresh the cache so
      // the post-checkout redirect on the client converges to "subscribed"
      // even if .subscription.created is still in flight. cacheSubscription
      // is an idempotent UPDATE — running it twice (here, then again from
      // .created) is safe.
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.mode !== "subscription" || !session.subscription) break;
      const subId = typeof session.subscription === "string"
        ? session.subscription
        : session.subscription.id;
      try {
        const sub = await stripe.subscriptions.retrieve(subId);
        const { userId } = await resolveCustomer(stripe, sub.customer);
        await cacheSubscription(admin, userId, sub.customer, sub);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error(`[stripe-webhook] checkout.session.completed retrieve/cache failed:`, msg);
        throw e; // bubble so the outer handler rolls back stripe_events
      }
      break;
    }

    case "customer.subscription.created": {
      const sub = event.data.object as Stripe.Subscription;
      const { email, name, userId } = await resolveCustomer(stripe, sub.customer);
      const item = sub.items.data[0];
      const amount = (item?.price?.unit_amount ?? 0) / 100;
      const currency = (item?.price?.currency ?? "eur").toUpperCase();
      const interval = item?.price?.recurring?.interval ?? "?";

      // Cache FIRST. If the cache write throws (DB hiccup), the outer
      // handler rolls back stripe_events and Stripe retries — and we will
      // NOT have sent admin or customer emails yet. Sending side-effects
      // before the DB commit was the bug that doubled the welcome email
      // on retries (see pre-launch-hardening-plan.md #10).
      await cacheSubscription(admin, userId, sub.customer, sub);

      // Atomic claim drives BOTH the admin email subject AND whether to
      // send the customer welcome. claimedFresh=true means we won the
      // claim (first ever Pro event for this user); false means returning
      // customer OR a parallel/duplicate event lost the race. Either way
      // the customer welcome must not re-fire.
      const claimedFresh = userId ? await claimProWelcome(admin, userId) : false;
      const isReturning = !claimedFresh;

      // Admin notification: a new paid customer is high-signal. Returning
      // customers are a different, lower-stakes signal — same payload but
      // a distinct subject so they don't read as fresh signups. Note: a
      // rare race could mislabel a true first-time signup as "returning"
      // if a peer event won the claim, but the customer experience is
      // unchanged and admin signal stays usable.
      const adminLabel = isReturning ? "Returning subscription" : "New subscription";
      await sendEmail({
        to: adminTo,
        subject: `Quantive ${isReturning ? "returning" : "new"} subscription: ${email ?? sub.customer}`,
        html: notificationHtml(adminLabel, [
          ["Customer", email ?? "(unknown)"],
          ...(name ? [["Name", name] as [string, string]] : []),
          ["Plan", `${amount} ${currency} / ${interval}`],
          ["Subscription ID", sub.id],
          ["Customer ID", String(sub.customer)],
        ]),
        text: notificationText(adminLabel, [
          ["Customer", email ?? "(unknown)"],
          ...(name ? [["Name", name] as [string, string]] : []),
          ["Plan", `${amount} ${currency} / ${interval}`],
          ["Subscription ID", sub.id],
          ["Customer ID", String(sub.customer)],
        ]),
      });

      // Pro onboarding email — only fired by the caller that won the
      // atomic claim above. If the send fails (Resend outage, malformed
      // recipient), release the claim so the next event (Stripe retry or
      // peer delivery) can retry. sendEmail returns a result rather than
      // throwing, so check ok explicitly.
      if (email && userId && claimedFresh) {
        const result = await sendProWelcomeEmail({ email, name, amount, currency, interval });
        if (!result.ok) {
          console.error(`[stripe-webhook] sendProWelcomeEmail failed for ${userId}:`, result.reason);
          await releaseProWelcomeClaim(admin, userId);
        }
      }
      break;
    }

    case "customer.subscription.updated": {
      const sub = event.data.object as Stripe.Subscription;
      const { email, userId } = await resolveCustomer(stripe, sub.customer);

      // Always refresh the cache — past_due transitions, plan changes, and
      // cancel_at_period_end flips all matter to the UI.
      await cacheSubscription(admin, userId, sub.customer, sub);

      // Admin emails only on the two cancellation-state transitions; other
      // updates (status, quantity, etc.) are cache-only and not high-signal.
      const prev = event.data.previous_attributes as
        | { cancel_at_period_end?: boolean }
        | undefined;
      const transition = cancellationTransition(prev, sub);
      if (transition.kind === "none") break;

      const endDate = (sub.items.data[0] as unknown as { current_period_end?: number })
        ?.current_period_end;
      const endLabel = endDate ? new Date(endDate * 1000).toISOString().slice(0, 10) : "(unknown)";

      if (transition.kind === "started") {
        const cancelReason = formatCancellationReason(sub.cancellation_details);
        await sendEmail({
          to: adminTo,
          subject: `Quantive cancellation requested: ${email ?? sub.customer}`,
          html: notificationHtml("Cancellation requested", [
            ["Customer", email ?? "(unknown)"],
            ["Reason", cancelReason],
            ["Access until", endLabel],
            ["Subscription ID", sub.id],
            ["Customer ID", String(sub.customer)],
          ]),
          text: notificationText("Cancellation requested", [
            ["Customer", email ?? "(unknown)"],
            ["Reason", cancelReason],
            ["Access until", endLabel],
            ["Subscription ID", sub.id],
            ["Customer ID", String(sub.customer)],
          ]),
        });
      } else {
        await sendEmail({
          to: adminTo,
          subject: `Quantive cancellation reverted: ${email ?? sub.customer}`,
          html: notificationHtml("Cancellation reverted", [
            ["Customer", email ?? "(unknown)"],
            ["Renews on", endLabel],
            ["Subscription ID", sub.id],
            ["Customer ID", String(sub.customer)],
          ]),
          text: notificationText("Cancellation reverted", [
            ["Customer", email ?? "(unknown)"],
            ["Renews on", endLabel],
            ["Subscription ID", sub.id],
            ["Customer ID", String(sub.customer)],
          ]),
        });
      }
      break;
    }

    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      const { email, userId } = await resolveCustomer(stripe, sub.customer);

      // Drop the cache to canceled so check-subscription stops treating
      // them as entitled. We keep stripe_customer_id so future re-subscribes
      // are still wired up.
      await clearSubscriptionCache(admin, userId, sub.customer);

      const cancelReason = formatCancellationReason(sub.cancellation_details);

      await sendEmail({
        to: adminTo,
        subject: `Quantive subscription ended: ${email ?? sub.customer}`,
        html: notificationHtml("Subscription ended", [
          ["Customer", email ?? "(unknown)"],
          ["Reason", cancelReason],
          ["Subscription ID", sub.id],
          ["Customer ID", String(sub.customer)],
        ]),
        text: notificationText("Subscription ended", [
          ["Customer", email ?? "(unknown)"],
          ["Reason", cancelReason],
          ["Subscription ID", sub.id],
          ["Customer ID", String(sub.customer)],
        ]),
      });
      break;
    }

    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      const { email } = await resolveCustomer(stripe, invoice.customer);
      const amount = (invoice.amount_due ?? 0) / 100;
      const currency = (invoice.currency ?? "eur").toUpperCase();
      const attempts = invoice.attempt_count ?? 0;

      await sendEmail({
        to: adminTo,
        subject: `Quantive payment failed: ${email ?? invoice.customer}`,
        html: notificationHtml("Payment failed", [
          ["Customer", email ?? "(unknown)"],
          ["Amount due", `${amount} ${currency}`],
          ["Attempts", String(attempts)],
          ["Invoice ID", invoice.id ?? "(none)"],
          ["Hosted URL", invoice.hosted_invoice_url ?? "(none)"],
        ]),
        text: notificationText("Payment failed", [
          ["Customer", email ?? "(unknown)"],
          ["Amount due", `${amount} ${currency}`],
          ["Attempts", String(attempts)],
          ["Invoice ID", invoice.id ?? "(none)"],
          ["Hosted URL", invoice.hosted_invoice_url ?? "(none)"],
        ]),
      });
      // The corresponding subscription.updated event will follow and refresh
      // the cache with status=past_due; nothing to do here cache-wise.
      break;
    }
  }
}

async function cacheSubscription(
  admin: AdminClient,
  userId: string | null,
  customerId: string | Stripe.Customer | Stripe.DeletedCustomer | null,
  sub: Stripe.Subscription,
) {
  if (!userId) {
    console.warn("[stripe-webhook] cache: no userId on customer metadata — skipping");
    return;
  }
  const row = buildCacheRow(sub as unknown as Parameters<typeof buildCacheRow>[0]);
  const customerIdStr = typeof customerId === "string"
    ? customerId
    : (customerId && "id" in customerId ? customerId.id : null);
  const { error } = await admin
    .from("profiles")
    .update({
      ...row,
      ...(customerIdStr ? { stripe_customer_id: customerIdStr } : {}),
    })
    .eq("user_id", userId);
  if (error) {
    // Throw so the outer handler rolls back the stripe_events row and
    // Stripe retries. Swallowing left the cache stale forever and forced
    // check-subscription to fall back to live Stripe on every dashboard
    // load — slow and expensive under launch traffic.
    console.error(`[stripe-webhook] cache update failed for ${userId}:`, error.message);
    throw new Error(`cache update failed: ${error.message}`);
  }
}

async function clearSubscriptionCache(
  admin: AdminClient,
  userId: string | null,
  customerId: string | Stripe.Customer | Stripe.DeletedCustomer | null,
) {
  if (!userId) return;
  const customerIdStr = typeof customerId === "string"
    ? customerId
    : (customerId && "id" in customerId ? customerId.id : null);
  const { error } = await admin
    .from("profiles")
    .update({
      subscription_status: "canceled",
      subscription_product_id: null,
      subscription_end: null,
      subscription_cancel_at_period_end: false,
      subscription_synced_at: new Date().toISOString(),
      ...(customerIdStr ? { stripe_customer_id: customerIdStr } : {}),
    })
    .eq("user_id", userId);
  if (error) {
    console.error(`[stripe-webhook] cache clear failed for ${userId}:`, error.message);
    throw new Error(`cache clear failed: ${error.message}`);
  }
}

async function resolveCustomer(
  stripe: Stripe,
  customer: string | Stripe.Customer | Stripe.DeletedCustomer | null,
): Promise<{ email: string | null; name: string | null; userId: string | null }> {
  if (!customer) return { email: null, name: null, userId: null };
  if (typeof customer !== "string") {
    if ("deleted" in customer && customer.deleted) return { email: null, name: null, userId: null };
    const c = customer as Stripe.Customer;
    return {
      email: c.email ?? null,
      name: c.name ?? null,
      userId: (c.metadata?.supabase_user_id as string | undefined) ?? null,
    };
  }
  try {
    const c = await stripe.customers.retrieve(customer);
    if ("deleted" in c && c.deleted) return { email: null, name: null, userId: null };
    return {
      email: c.email ?? null,
      name: c.name ?? null,
      userId: (c.metadata?.supabase_user_id as string | undefined) ?? null,
    };
  } catch {
    return { email: null, name: null, userId: null };
  }
}

/**
 * Atomically claim the Pro welcome-send slot. Returns true iff this caller
 * won the claim (i.e. it's the first event ever for this user); false if
 * the slot is already taken (returning customer or duplicate event).
 *
 * Conditional UPDATE with `.is("pro_welcome_sent_at", null)` flips the
 * flag iff it's still null; the `.select()` returns rows only on the
 * winning claim. Mirrors the send-welcome-email pattern — same reason:
 * eliminates the read-then-write race that fired duplicate emails when
 * two flows raced through the dedupe gate.
 *
 * Fail-closed on DB error: if we can't decide, assume returning and skip
 * the welcome. The user already got the Stripe receipt and can see Pro
 * in the app; missing our welcome is mild.
 */
async function claimProWelcome(admin: AdminClient, userId: string): Promise<boolean> {
  const { data, error } = await admin
    .from("profiles")
    .update({ pro_welcome_sent_at: new Date().toISOString() })
    .eq("user_id", userId)
    .is("pro_welcome_sent_at", null)
    .select("user_id");
  if (error) {
    console.error(`[stripe-webhook] claimProWelcome failed for ${userId}:`, error.message);
    return false;
  }
  return Array.isArray(data) && data.length > 0;
}

/**
 * Release a previously-won claim — used on send failure so the next event
 * for this user can retry the welcome. Logged but not thrown: the outer
 * handler's stripe_events row is already committed and rolling back to
 * re-deliver is the wrong remedy.
 */
async function releaseProWelcomeClaim(admin: AdminClient, userId: string): Promise<void> {
  const { error } = await admin
    .from("profiles")
    .update({ pro_welcome_sent_at: null })
    .eq("user_id", userId);
  if (error) {
    console.error(`[stripe-webhook] releaseProWelcomeClaim failed for ${userId}:`, error.message);
  }
}

async function sendProWelcomeEmail(params: {
  email: string;
  name: string | null;
  amount: number;
  currency: string;
  interval: string;
}): Promise<import("../_shared/email.ts").SendEmailResult> {
  const { email, name, amount, currency, interval } = params;
  const greeting = name ? `Hi ${escapeHtml(name.split(" ")[0])},` : "Hi,";
  const planLabel = `${amount} ${currency} / ${interval}`;

  const bodyHtml = `
    <p style="margin: 0 0 16px;">${greeting}</p>
    <p style="margin: 0 0 16px;">Thanks for upgrading. Your subscription is active (${escapeHtml(planLabel)}). Stripe will email a separate receipt with the formal invoice for your records.</p>
    <p style="margin: 0 0 12px;">What's now unlocked:</p>
    <ul style="margin: 0 0 16px; padding-left: 20px;">
      <li style="margin-bottom: 4px;">Full historical view — every snapshot you've recorded, charted and tabular</li>
      <li style="margin-bottom: 4px;">Forecasting engine with CAGR projection and 95% confidence intervals</li>
      <li style="margin-bottom: 4px;">Milestone &amp; goal tracking</li>
      <li style="margin-bottom: 4px;">Benchmark comparison against S&amp;P 500 and inflation</li>
      <li style="margin-bottom: 4px;">Month-by-month summary table</li>
      <li>Excel/CSV export and PDF wealth report</li>
    </ul>
    <p style="margin: 0 0 16px;">You can manage your subscription, update your card, or cancel at any time from <a href="https://usequantive.app/settings" style="color: #111;">Settings → Billing</a>. If anything breaks or surprises you, reply to this email — it goes straight to me.</p>
    <p style="margin: 0 0 4px;">Thanks,</p>
    <p style="margin: 0;">Pedro · Quantive</p>
  `;
  const html = brandedEmailHtml({ heading: "Welcome to Quantive Pro", bodyHtml });
  const text =
    `Welcome to Quantive Pro\n\n` +
    `${name ? `Hi ${name.split(" ")[0]},` : "Hi,"}\n\n` +
    `Thanks for upgrading. Your subscription is active (${planLabel}). Stripe will email a separate receipt with the formal invoice for your records.\n\n` +
    `What's now unlocked:\n` +
    `- Full historical view — every snapshot you've recorded, charted and tabular\n` +
    `- Forecasting engine with CAGR projection and 95% confidence intervals\n` +
    `- Milestone & goal tracking\n` +
    `- Benchmark comparison against S&P 500 and inflation\n` +
    `- Month-by-month summary table\n` +
    `- Excel/CSV export and PDF wealth report\n\n` +
    `Manage your subscription at https://usequantive.app/settings. If anything breaks or surprises you, reply to this email — it goes straight to me.\n\n` +
    `Thanks,\nPedro · Quantive`;

  return sendEmail({
    to: email,
    subject: "Welcome to Quantive Pro",
    html,
    text,
    replyTo: Deno.env.get("FOUNDER_REPLY_TO_EMAIL") || "hello@usequantive.app",
  });
}

function notificationHtml(title: string, rows: Array<[string, string]>): string {
  const items = rows
    .map(
      ([k, v]) =>
        `<p style="margin: 0 0 4px;"><strong>${escapeHtml(k)}:</strong> ${escapeHtml(v)}</p>`,
    )
    .join("");
  return `
    <div style="font-family: ui-sans-serif, system-ui, sans-serif; max-width: 560px;">
      <h2 style="margin: 0 0 12px;">${escapeHtml(title)}</h2>
      ${items}
    </div>
  `;
}

function notificationText(title: string, rows: Array<[string, string]>): string {
  return `${title}\n\n${rows.map(([k, v]) => `${k}: ${v}`).join("\n")}`;
}
