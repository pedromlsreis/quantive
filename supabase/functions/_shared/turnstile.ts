// Server-side Cloudflare Turnstile verification.
//
// The secret lives in the TURNSTILE_SECRET_KEY function env var (set it with
// `supabase secrets set TURNSTILE_SECRET_KEY=...`). When the secret is unset
// (local dev, or before it is configured), verification is SKIPPED so the flow
// still works — mirroring the client, where an unset VITE_TURNSTILE_SITE_KEY
// means no widget and no token. Set the secret in production to enforce.

const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export interface TurnstileResult {
  ok: boolean;
  /** True when no secret is configured and the check was skipped. */
  skipped?: boolean;
}

/**
 * Verify a Turnstile token against Cloudflare's siteverify endpoint. Fails
 * closed: a missing token or any verification error returns { ok: false } so a
 * configured guard can't be bypassed by withholding or breaking the token.
 */
export async function verifyTurnstile(token: string | null, ip?: string): Promise<TurnstileResult> {
  const secret = Deno.env.get("TURNSTILE_SECRET_KEY");
  if (!secret) return { ok: true, skipped: true };
  if (!token) return { ok: false };

  try {
    const form = new URLSearchParams();
    form.set("secret", secret);
    form.set("response", token);
    if (ip && ip !== "unknown") form.set("remoteip", ip);

    const res = await fetch(SITEVERIFY_URL, { method: "POST", body: form });
    const data = (await res.json().catch(() => null)) as { success?: boolean } | null;
    return { ok: Boolean(data?.success) };
  } catch (e) {
    console.error("[turnstile] verify threw:", e instanceof Error ? e.message : String(e));
    return { ok: false };
  }
}
