// Pure validation for the submit-feedback request body. Lifted out of the
// serve() handler so all reject paths can be tested without standing up a
// fake fetch context.
//
// Rules mirror what the table-level CHECK constraints enforce, plus a
// length cap so an abusive payload never reaches the DB.

export const VALID_FEEDBACK_TYPES = ["feature", "improvement", "bug"] as const;
export type FeedbackType = (typeof VALID_FEEDBACK_TYPES)[number];

export const MAX_MESSAGE_LENGTH = 2000;

export type FeedbackBodyResult =
  | { ok: true; type: FeedbackType; message: string }
  | { ok: false; status: 400; error: string };

export function parseFeedbackBody(raw: unknown): FeedbackBodyResult {
  if (!raw || typeof raw !== "object") {
    return { ok: false, status: 400, error: "Missing type or message" };
  }
  const { type, message } = raw as { type?: unknown; message?: unknown };

  if (!type || !message) {
    return { ok: false, status: 400, error: "Missing type or message" };
  }

  if (
    typeof type !== "string" ||
    !(VALID_FEEDBACK_TYPES as readonly string[]).includes(type)
  ) {
    // Strict equality (no implicit trim) — matches the prior handler and
    // the CHECK constraint on the feedback table.
    return { ok: false, status: 400, error: "Invalid feedback type" };
  }

  if (typeof message !== "string") {
    return { ok: false, status: 400, error: "Message must be 1-2000 characters" };
  }
  const trimmed = message.trim();
  if (trimmed.length === 0 || message.length > MAX_MESSAGE_LENGTH) {
    return { ok: false, status: 400, error: "Message must be 1-2000 characters" };
  }

  return {
    ok: true,
    type: type as FeedbackType,
    message: trimmed,
  };
}
