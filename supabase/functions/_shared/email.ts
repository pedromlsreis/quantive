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
        subject: params.subject,
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
