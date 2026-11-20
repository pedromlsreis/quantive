// When each user last used the app, for the admin dashboard. Not
// auth.users.last_sign_in_at alone: a persisted session skips sign-in, so the
// SQL function also reads each session's last token refresh (see migration
// 20261120120000_admin_last_seen.sql).

interface LastSeenClient {
  rpc(fn: "admin_last_seen"): PromiseLike<{ data: unknown; error: { message: string } | null }>;
}

// User id -> ISO 8601 UTC timestamp, the same format as Date#toISOString, so
// callers can compare against one with plain string comparison.
export async function fetchLastSeen(client: LastSeenClient): Promise<Map<string, string>> {
  const { data, error } = await client.rpc("admin_last_seen");
  if (error) throw new Error(`admin_last_seen failed: ${error.message}`);
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    throw new Error("admin_last_seen returned an unexpected shape");
  }
  const seen = new Map<string, string>();
  for (const [userId, at] of Object.entries(data)) {
    const ms = typeof at === "string" ? Date.parse(at) : NaN;
    if (!Number.isNaN(ms)) seen.set(userId, new Date(ms).toISOString());
  }
  return seen;
}
