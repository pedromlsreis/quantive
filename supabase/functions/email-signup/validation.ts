// Pure validation for the email-signup request body, mirroring submit-feedback's
// validation module so reject paths are unit-testable without a fetch context.

export const MAX_EMAIL_LENGTH = 254;
export const VALID_SOURCES = ["landing"] as const;
export type SignupSource = (typeof VALID_SOURCES)[number];

// Pragmatic shape check; the function also lowercases before insert and the
// table CHECK constraint is the final backstop.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type EmailSignupBodyResult =
  | { ok: true; email: string; token: string | null; source: SignupSource }
  | { ok: false; status: 400; error: string };

export function parseEmailSignupBody(raw: unknown): EmailSignupBodyResult {
  if (!raw || typeof raw !== "object") {
    return { ok: false, status: 400, error: "Invalid request body" };
  }
  const { email, token, source } = raw as { email?: unknown; token?: unknown; source?: unknown };

  if (typeof email !== "string") {
    return { ok: false, status: 400, error: "A valid email is required" };
  }
  const normalised = email.trim().toLowerCase();
  if (
    normalised.length === 0 ||
    normalised.length > MAX_EMAIL_LENGTH ||
    !EMAIL_RE.test(normalised)
  ) {
    return { ok: false, status: 400, error: "A valid email is required" };
  }

  const tok = typeof token === "string" && token.length > 0 ? token : null;
  const src: SignupSource =
    typeof source === "string" && (VALID_SOURCES as readonly string[]).includes(source)
      ? (source as SignupSource)
      : "landing";

  return { ok: true, email: normalised, token: tok, source: src };
}
