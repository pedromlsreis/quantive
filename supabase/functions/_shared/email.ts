// Shared Resend email sender for Quantive edge functions.
// All transactional/notification emails should go through sendEmail().

const DEFAULT_FROM = "Quantive <noreply@usequantive.app>";

export type SendEmailParams = {
  to: string | string[];
  subject: string;
  html: string;
  text: string;
  replyTo?: string | null;
  from?: string;
};

export type SendEmailResult =
  | { ok: true; id?: string }
  | { ok: false; reason: string; status?: number };

export async function sendEmail(params: SendEmailParams): Promise<SendEmailResult> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) {
    console.warn("[email] RESEND_API_KEY not set — skipping send");
    return { ok: false, reason: "no_api_key" };
  }

  const from = params.from || Deno.env.get("EMAIL_FROM") || DEFAULT_FROM;
  const to = Array.isArray(params.to) ? params.to : [params.to];
  // Resend (and RFC 5322) rejects CR/LF in subject. A user pasting multi-line
  // feedback once 422'd every notification — sanitise defensively here so no
  // caller can repeat that.
  const subject = sanitizeSubject(params.subject);

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to,
        subject,
        html: params.html,
        text: params.text,
        reply_to: params.replyTo || undefined,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      console.error(`[email] Resend ${res.status}: ${body}`);
      return { ok: false, reason: body, status: res.status };
    }

    const data = (await res.json().catch(() => ({}))) as { id?: string };
    return { ok: true, id: data.id };
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    console.error("[email] Send failed:", reason);
    return { ok: false, reason };
  }
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Wrap customer-facing email body content in the Quantive brand shell:
 * logo + wordmark header, white card on grey background, subtle footer.
 * The Supabase Auth HTML templates use the same visual pattern so the
 * full email experience (signup confirm → welcome → receipt) feels
 * consistent. Email-safe layout: <table> with inline styles.
 *
 * Founder-internal notification emails (sendEmail directly from
 * stripe-webhook, submit-feedback, delete-account → admin alerts) do NOT
 * use this — they're plain blocks for fast scanning.
 */
export function brandedEmailHtml(params: {
  heading: string;
  bodyHtml: string;
  footerHtml?: string;
}): string {
  const { heading, bodyHtml, footerHtml } = params;
  const footer = footerHtml ??
    `<a href="https://usequantive.app" style="color: #6b7280;">usequantive.app</a> · <a href="https://usequantive.app/settings" style="color: #6b7280;">Settings</a> · <a href="mailto:hello@usequantive.app" style="color: #6b7280;">hello@usequantive.app</a>`;
  return `<!DOCTYPE html>
<html lang="en">
<body style="margin: 0; padding: 24px; background: #fafafa; font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #111;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width: 100%; max-width: 560px; margin: 0 auto; background: #fff; border: 1px solid #e5e7eb; border-radius: 8px;">
    <tr>
      <td style="padding: 24px 32px 16px; border-bottom: 1px solid #f0f0f0;">
        <a href="https://usequantive.app" style="text-decoration: none; color: #111;">
          <img src="https://usequantive.app/logo.png" alt="Quantive" width="28" height="28" style="display: inline-block; vertical-align: middle; border: 0;" />
          <span style="display: inline-block; vertical-align: middle; margin-left: 8px; font-size: 16px; font-weight: 500; letter-spacing: -0.01em; color: #111;">Quantive</span>
        </a>
      </td>
    </tr>
    <tr>
      <td style="padding: 28px 32px 8px;">
        <h1 style="margin: 0 0 16px; font-size: 20px; font-weight: 600; color: #111;">${escapeHtml(heading)}</h1>
        <div style="font-size: 15px; line-height: 1.55; color: #1f2937;">${bodyHtml}</div>
      </td>
    </tr>
    <tr>
      <td style="padding: 16px 32px 24px; border-top: 1px solid #f0f0f0;">
        <p style="margin: 0; font-size: 12px; color: #6b7280; line-height: 1.5;">${footer}</p>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function sanitizeSubject(s: string): string {
  // Collapse any CR/LF/tab to a single space; trim runs. Resend rejects the
  // raw control chars and downstream clients treat them as header injection.
  const cleaned = s.replace(/[\r\n\t]+/g, " ").replace(/\s{2,}/g, " ").trim();
  // Hard cap — long subjects are not the point of feedback notifications.
  return cleaned.length > 200 ? cleaned.slice(0, 197) + "..." : cleaned;
}
