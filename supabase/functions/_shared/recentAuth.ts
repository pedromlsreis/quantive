// How an access token's session was opened, from its amr claim, for actions
// that need more than a valid session. A refreshed token keeps the amr of the
// sign-in that opened its session, so an old session never looks recent.
//
// The payload is decoded, not verified: call auth.getUser(token) first.

// GoTrue records email-link sessions with amr method "otp" (verified against
// the production project on 2026-09-30); "recovery" and "magiclink" are
// accepted too in case a later GoTrue version names them.
const EMAIL_LINK_METHODS = new Set(["otp", "recovery", "magiclink"]);
const PASSWORD_METHODS = new Set(["password"]);
const CLOCK_SKEW_SECONDS = 60;

// Whether an access token was issued from an emailed link (password reset,
// magic link, signup confirmation) within the last `maxAgeSeconds`. Only
// someone with access to the account's inbox can open such a session, so it
// gates destructive actions a stolen password session must not reach.
export function hasRecentEmailLinkAuth(
  accessToken: string,
  nowSeconds: number,
  maxAgeSeconds = 3600,
): boolean {
  return hasRecentAuth(accessToken, EMAIL_LINK_METHODS, nowSeconds, maxAgeSeconds);
}

// Whether the session was opened by typing the password within the last
// `maxAgeSeconds`. The client signs in again just before it asks, so a stolen
// session, older than the window and without the password, can't pass. Gates
// deleting the account and changing its email.
export function hasRecentPasswordAuth(
  accessToken: string,
  nowSeconds: number,
  maxAgeSeconds = 300,
): boolean {
  return hasRecentAuth(accessToken, PASSWORD_METHODS, nowSeconds, maxAgeSeconds);
}

function hasRecentAuth(
  accessToken: string,
  methods: ReadonlySet<string>,
  nowSeconds: number,
  maxAgeSeconds: number,
): boolean {
  const amr = decodeJwtPayload(accessToken)?.amr;
  if (!Array.isArray(amr)) return false;
  return amr.some((entry) => {
    if (typeof entry !== "object" || entry === null) return false;
    const { method, timestamp } = entry as { method?: unknown; timestamp?: unknown };
    if (typeof method !== "string" || !methods.has(method)) return false;
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
