// Stable, client-safe error codes for edge functions. Internal detail
// (stack traces, env-var names, third-party error messages) must never
// reach the browser — log it internally and return one of these.

export type ErrorCode =
  | "unauthenticated"
  | "email_unverified"
  | "invalid_request"
  | "rate_limited"
  | "not_found"
  | "checkout_unavailable"
  | "portal_unavailable"
  | "delete_failed"
  | "internal_error";

export function jsonErrorResponse(
  code: ErrorCode,
  status: number,
  headers: Record<string, string> = {},
  extra?: Record<string, unknown>,
): Response {
  return new Response(JSON.stringify({ error: code, ...extra }), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}
