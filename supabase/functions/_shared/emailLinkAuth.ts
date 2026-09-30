// Whether an access token was issued from an emailed link (password reset,
// magic link, signup confirmation) within the last `maxAgeSeconds`. Only
// someone with access to the account's inbox can open such a session, so it
// gates destructive actions a stolen password session must not reach.
//
// GoTrue records these sessions with amr method "otp" (verified against the
// production project on 2026-09-30); "recovery" and "magiclink" are accepted
// too in case a later GoTrue version names them.
//
// The payload is decoded, not verified: call auth.getUser(token) first.

const EMAIL_LINK_METHODS = new Set(["otp", "recovery", "magiclink"]);
const CLOCK_SKEW_SECONDS = 60;

export function hasRecentEmailLinkAuth(
  accessToken: string,
  nowSeconds: number,
  maxAgeSeconds = 3600,
): boolean {
  const amr = decodeJwtPayload(accessToken)?.amr;
  if (!Array.isArray(amr)) return false;
  return amr.some((entry) => {
    if (typeof entry !== "object" || entry === null) return false;
    const { method, timestamp } = entry as { method?: unknown; timestamp?: unknown };
    if (typeof method !== "string" || !EMAIL_LINK_METHODS.has(method)) return false;
    if (typeof timestamp !== "number") return false;
    const age = nowSeconds - timestamp;
    return age <= maxAgeSeconds && age >= -CLOCK_SKEW_SECONDS;
  });
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    const bytes = Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
    const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes));
    return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
