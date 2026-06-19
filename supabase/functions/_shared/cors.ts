// Shared CORS helper for browser-callable edge functions.
//
// Replaces the previous `Access-Control-Allow-Origin: *` pattern, which let
// any site call our functions with the user's auth header from a browser.
//
// We mirror the incoming `Origin` only when it appears in an allowlist. Requests
// from origins outside the allowlist receive no `Access-Control-Allow-Origin`
// header at all, which causes the browser to reject the response. Server-to-
// server callers (no Origin header) are unaffected since CORS does not apply
// to them — auth is still enforced on the request itself.
//
// Allowlist sources, in order:
//   1. The ALLOWED_ORIGINS env var (comma-separated). Set this on Supabase
//      project secrets to override the default list without redeploying code.
//   2. The DEFAULT_ALLOWED_ORIGINS list below.

const DEFAULT_ALLOWED_ORIGINS = [
  "https://usequantive.app",
  "http://localhost:5173",
  "http://localhost:3000",
  "http://localhost:8080", // Vite dev server (npm run dev)
];

const ALLOWED_HEADERS = [
  "authorization",
  "x-client-info",
  "apikey",
  "content-type",
  "x-supabase-client-platform",
  "x-supabase-client-platform-version",
  "x-supabase-client-runtime",
  "x-supabase-client-runtime-version",
].join(", ");

/**
 * Parse the ALLOWED_ORIGINS env var (comma-separated) or fall back to the
 * defaults. Empty / whitespace-only input falls back too.
 */
export function parseAllowedOrigins(raw: string | null | undefined): string[] {
  if (!raw) return DEFAULT_ALLOWED_ORIGINS;
  const parsed = raw.split(",").map((s) => s.trim()).filter(Boolean);
  return parsed.length > 0 ? parsed : DEFAULT_ALLOWED_ORIGINS;
}

function getAllowedOrigins(): string[] {
  return parseAllowedOrigins(Deno.env.get("ALLOWED_ORIGINS"));
}

/**
 * Pure allowlist check. Returns the origin to echo, or `null` to omit the
 * `Access-Control-Allow-Origin` header entirely. Exported for unit testing.
 */
export function pickAllowedOrigin(origin: string | null, allowlist: readonly string[]): string | null {
  if (!origin) return null;
  return allowlist.includes(origin) ? origin : null;
}

/**
 * Build CORS headers for a response, echoing the request's Origin if and only
 * if it is in the allowlist. Always emits `Vary: Origin` so caches don't
 * collapse responses from different origins.
 */
export function buildCorsHeaders(req: Request): Record<string, string> {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": ALLOWED_HEADERS,
    "Vary": "Origin",
  };
  const allowed = pickAllowedOrigin(req.headers.get("origin"), getAllowedOrigins());
  if (allowed) headers["Access-Control-Allow-Origin"] = allowed;
  return headers;
}

/**
 * Standard preflight response. Use this for `req.method === "OPTIONS"`.
 */
export function corsPreflightResponse(req: Request): Response {
  return new Response(null, { status: 204, headers: buildCorsHeaders(req) });
}

/**
 * Resolve the base URL to use when building Stripe `success_url` /
 * `return_url`. We trust the request's Origin header only when it appears
 * in the same allowlist used for CORS, falling back to the canonical
 * production URL otherwise.
 *
 * Background: CORS gates which sites the browser will accept *responses*
 * from, but does not validate the body of the request itself. A
 * server-to-server caller with a stolen JWT can supply any Origin string,
 * and Stripe will happily redirect the user to that domain after checkout.
 * Pinning the redirect base to an allowlisted origin closes that gap.
 */
export function safeRedirectOrigin(req: Request): string {
  const allowlist = getAllowedOrigins();
  const supplied = req.headers.get("origin");
  const allowed = pickAllowedOrigin(supplied, allowlist);
  if (allowed) return allowed;
  // Prefer the first allowlisted origin (canonical production URL is first
  // in DEFAULT_ALLOWED_ORIGINS) over a localhost fallback.
  return allowlist[0] ?? "https://usequantive.app";
}
