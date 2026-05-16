// Receives Stripe webhook events and emails the admin on the high-signal ones:
// new subscription, payment failure, and cancellation/churn.
//
// Stripe webhook signing secret must be set as STRIPE_WEBHOOK_SECRET.

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { escapeHtml, sendEmail } from "../_shared/email.ts";

const HANDLED_EVENTS = new Set([
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

  try {
    await handleEvent(stripe, event);
  } catch (e) {
    // Log but return 200 — we don't want Stripe to retry just because our
    // email failed. The DB-of-record is Stripe itself.
    console.error(`[stripe-webhook] Handler failed for ${event.type}:`, e);
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { "Content-Type": "application/json" },
  });
});

async function handleEvent(stripe: Stripe, event: Stripe.Event) {
  const to = Deno.env.get("STRIPE_NOTIFY_TO_EMAIL") || "hello@usequantive.app";

  switch (event.type) {
    case "customer.subscription.created": {
      const sub = event.data.object as Stripe.Subscription;
      const { email, name } = await resolveCustomer(stripe, sub.customer);
      const item = sub.items.data[0];
      const amount = (item?.price?.unit_amount ?? 0) / 100;
      const currency = (item?.price?.currency ?? "eur").toUpperCase();
      const interval = item?.price?.recurring?.interval ?? "?";

      await sendEmail({
        to,
        subject: `New Quantive subscription: ${email ?? sub.customer}`,
        html: notificationHtml("New subscription", [
          ["Customer", email ?? "(unknown)"],
          ...(name ? [["Name", name] as [string, string]] : []),
          ["Plan", `${amount} ${currency} / ${interval}`],
          ["Subscription ID", sub.id],
          ["Customer ID", String(sub.customer)],
        ]),
        text: notificationText("New subscription", [
          ["Customer", email ?? "(unknown)"],
          ...(name ? [["Name", name] as [string, string]] : []),
          ["Plan", `${amount} ${currency} / ${interval}`],
          ["Subscription ID", sub.id],
          ["Customer ID", String(sub.customer)],
        ]),
      });
      break;
    }

    case "customer.subscription.updated": {
      // We only care about two transitions on update:
      //   - cancel_at_period_end flipped false → true  (user requested cancellation)
      //   - cancel_at_period_end flipped true → false  (user reactivated)
      // Everything else (plan switch, quantity change, etc.) is noise for now.
      const sub = event.data.object as Stripe.Subscription;
      const prev = event.data.previous_attributes as
        | { cancel_at_period_end?: boolean }
        | undefined;
      if (!prev || prev.cancel_at_period_end === undefined) break;
      const wasCancelling = prev.cancel_at_period_end;
      const isCancelling = sub.cancel_at_period_end;
      if (wasCancelling === isCancelling) break;

      const { email } = await resolveCustomer(stripe, sub.customer);
      const endDate = (sub.items.data[0] as unknown as { current_period_end?: number })
        ?.current_period_end;
      const endLabel = endDate ? new Date(endDate * 1000).toISOString().slice(0, 10) : "(unknown)";

      if (isCancelling) {
        const cancelReason =
          sub.cancellation_details?.reason ??
          sub.cancellation_details?.feedback ??
          "(none provided)";
        await sendEmail({
          to,
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
          to,
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
      const { email } = await resolveCustomer(stripe, sub.customer);
      const cancelReason =
        sub.cancellation_details?.reason ??
        sub.cancellation_details?.feedback ??
        "(none provided)";

      await sendEmail({
        to,
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
        to,
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
      break;
    }
  }
}

async function resolveCustomer(
  stripe: Stripe,
  customer: string | Stripe.Customer | Stripe.DeletedCustomer | null,
): Promise<{ email: string | null; name: string | null }> {
  if (!customer) return { email: null, name: null };
  if (typeof customer !== "string") {
    if ("deleted" in customer && customer.deleted) return { email: null, name: null };
    const c = customer as Stripe.Customer;
    return { email: c.email ?? null, name: c.name ?? null };
  }
  try {
    const c = await stripe.customers.retrieve(customer);
    if ("deleted" in c && c.deleted) return { email: null, name: null };
    return { email: c.email ?? null, name: c.name ?? null };
  } catch {
    return { email: null, name: null };
  }
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
