// Admin user management:
//   GET    -> list users with their roles
//   POST   -> { action: 'grant' | 'revoke', userId, role } mutate roles
//          -> { action: 'delete', userId } permanently delete a user
//
// Auth: caller must be authenticated AND have role='admin' in user_roles.
// Role mutations also re-check the `is_admin` SQL function — defense in depth.

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status,
  });

const ALLOWED_ROLES = new Set(["admin", "moderator"]);

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) return json({ error: "Unauthorized" }, 401);

    const service = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false },
    });

    const { data: adminCheck, error: roleErr } = await service.rpc("is_admin", {
      _user_id: user.id,
    });
    if (roleErr || adminCheck !== true) return json({ error: "Forbidden" }, 403);

    if (req.method === "GET") {
      const url = new URL(req.url);
      const search = (url.searchParams.get("q") ?? "").trim().toLowerCase();
      const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "200", 10) || 200, 1000);

      // Pull all roles in one shot (small table) and join in memory.
      const { data: roles, error: rolesErr } = await service
        .from("user_roles")
        .select("user_id, role, granted_at, granted_by");
      if (rolesErr) throw rolesErr;
      const rolesByUser = new Map<string, { role: string; granted_at: string }[]>();
      for (const r of roles ?? []) {
        const list = rolesByUser.get(r.user_id) ?? [];
        list.push({ role: r.role, granted_at: r.granted_at });
        rolesByUser.set(r.user_id, list);
      }

      const users: Array<{
        id: string;
        email: string | null;
        created_at: string;
        last_sign_in_at: string | null;
        confirmed: boolean;
        roles: { role: string; granted_at: string }[];
      }> = [];

      let page = 1;
      const perPage = 1000;
      while (users.length < limit) {
        const { data, error } = await service.auth.admin.listUsers({ page, perPage });
        if (error) throw error;
        const list = data?.users ?? [];
        for (const u of list) {
          if (search && !(u.email ?? "").toLowerCase().includes(search)) continue;
          users.push({
            id: u.id,
            email: u.email ?? null,
            created_at: u.created_at ?? "",
            last_sign_in_at: u.last_sign_in_at ?? null,
            confirmed: !!u.email_confirmed_at,
            roles: rolesByUser.get(u.id) ?? [],
          });
          if (users.length >= limit) break;
        }
        if (list.length < perPage) break;
        page++;
        if (page > 50) break;
      }

      return json({ users });
    }

    if (req.method === "POST") {
      const body = await req.json().catch(() => null) as
        | { action?: string; userId?: string; role?: string }
        | null;
      if (!body) return json({ error: "Invalid body" }, 400);

      const { action, userId, role } = body;
      if (!userId) return json({ error: "Missing userId" }, 400);

      if (action === "delete") {
        if (userId === user.id) {
          return json({ error: "You cannot delete your own account from here." }, 400);
        }
        // Mirrors the user-facing delete-account flow: clean up dependent
        // rows first, then drop the auth user. The FK cascades would catch
        // anything we miss, but explicit deletes make intent obvious and
        // help if a future schema changes a cascade rule.
        await service.from("portfolio_snapshots").delete().eq("user_id", userId);
        await service.from("feedback").delete().eq("user_id", userId);
        await service.from("user_roles").delete().eq("user_id", userId);
        await service.from("user_keys").delete().eq("user_id", userId);
        await service.from("profiles").delete().eq("user_id", userId);

        const { error: delErr } = await service.auth.admin.deleteUser(userId);
        if (delErr) return json({ error: delErr.message }, 400);
        return json({ ok: true });
      }

      if (!role || !ALLOWED_ROLES.has(role)) {
        return json({ error: "Invalid role" }, 400);
      }

      if (action === "grant") {
        const { error } = await service
          .from("user_roles")
          .insert({ user_id: userId, role, granted_by: user.id });
        if (error && !/duplicate key/i.test(error.message)) {
          return json({ error: error.message }, 400);
        }
        return json({ ok: true });
      }

      if (action === "revoke") {
        const { error } = await service
          .from("user_roles")
          .delete()
          .eq("user_id", userId)
          .eq("role", role);
        if (error) return json({ error: error.message }, 400);
        return json({ ok: true });
      }

      return json({ error: "Unknown action" }, 400);
    }

    return json({ error: "Method not allowed" }, 405);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[admin-users] error:", msg);
    return json({ error: msg }, 500);
  }
});
