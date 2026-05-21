// Rate-limit guard for authenticated edge functions. Wraps the existing
// public.check_rate_limit(p_ip, ...) RPC and returns a typed result.
//
// Fails open on RPC error: a transient DB issue should not block a paying
// user from opening checkout. The risk is one extra unthrottled request
// per outage; the cost of a false positive is a lost conversion.

// Use an unknown-typed client so this module stays runnable in both Deno
// (npm:@supabase/supabase-js) and Vitest contexts without dragging the SDK
// into the test dependency graph.
interface RpcCapable {
  rpc(
    name: string,
    args: Record<string, unknown>,
  ): Promise<{ data: unknown; error: { message: string } | null }>;
}

export interface RateLimitOptions {
  ip: string;
  maxRequests?: number;
  windowSeconds?: number;
}

export type RateLimitResult =
  | { allowed: true }
  | { allowed: false; retryAfter: number };

export async function checkRateLimit(
  client: RpcCapable,
  opts: RateLimitOptions,
): Promise<RateLimitResult> {
  const { ip, maxRequests, windowSeconds } = opts;
  const args: Record<string, unknown> = { p_ip: ip };
  if (maxRequests !== undefined) args.p_max_requests = maxRequests;
  if (windowSeconds !== undefined) args.p_window_seconds = windowSeconds;

  try {
    const { data, error } = await client.rpc("check_rate_limit", args);
    if (error) {
      console.error("[rate-limit] RPC failed:", error.message);
      return { allowed: true };
    }
    if (data === false) {
      return { allowed: false, retryAfter: windowSeconds ?? 60 };
    }
    return { allowed: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[rate-limit] threw:", msg);
    return { allowed: true };
  }
}

export function extractIp(req: Request): string {
  return (
    req.headers.get("CF-Connecting-IP") ||
    req.headers.get("X-Forwarded-For")?.split(",")[0].trim() ||
    "unknown"
  );
}
