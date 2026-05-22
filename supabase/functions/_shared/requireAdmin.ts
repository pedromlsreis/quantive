// Auth guard used by admin-only edge functions. Centralises the
// "Authorization header present + valid JWT + is_admin() true" check so
// each admin endpoint can't accidentally diverge on the rejection paths.
//
// The clients are typed structurally — we avoid importing supabase-js
// here so the helper stays unit-testable under vitest without dragging
// in the SDK's npm:/https: specifiers.

interface AuthClient {
  auth: {
    getUser(): Promise<{
      data: { user: { id: string } | null };
      error: { message: string } | null;
    }>;
  };
}

interface RpcClient {
  rpc(
    name: string,
    args: Record<string, unknown>,
  ): Promise<{ data: unknown; error: { message: string } | null }>;
}

export type AdminGateOutcome =
  | { ok: true; userId: string }
  | { ok: false; status: 401; error: "Unauthorized" }
  | { ok: false; status: 403; error: "Forbidden" };

export async function requireAdmin(
  authHeader: string | null,
  userClient: AuthClient,
  serviceClient: RpcClient,
): Promise<AdminGateOutcome> {
  // No Authorization header — anonymous caller. Return 401, never 403,
  // so probers can't distinguish "not logged in" from "logged in but
  // unprivileged" from the response alone.
  if (!authHeader) return { ok: false, status: 401, error: "Unauthorized" };

  const { data, error: authErr } = await userClient.auth.getUser();
  if (authErr || !data?.user) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }

  // is_admin() is SECURITY DEFINER, so it returns the truth regardless of
  // which client calls it. We pass the resolved user.id, never trust the
  // caller to claim a user id.
  const { data: adminCheck, error: roleErr } = await serviceClient.rpc("is_admin", {
    _user_id: data.user.id,
  });
  if (roleErr || adminCheck !== true) {
    return { ok: false, status: 403, error: "Forbidden" };
  }

  return { ok: true, userId: data.user.id };
}
