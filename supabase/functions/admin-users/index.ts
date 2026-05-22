// Admin user management:
//   GET    -> list users with their roles
//   POST   -> { action: 'grant' | 'revoke', userId, role } mutate roles
//          -> { action: 'delete', userId } permanently delete a user
//
// Auth: caller must be authenticated AND have role='admin' in user_roles.
// Role mutations also re-check the `is_admin` SQL function — defense in depth.

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { cancelActiveSubscriptions, isFullyCancelled } from "../_shared/cancelStripeSubscriptions.ts";
import { buildCorsHeaders, corsPreflightResponse } from "../_shared/cors.ts";
import { requireAdmin } from "../_shared/requireAdmin.ts";
import { deleteUserData } from "../_shared/userDataDelete.ts";

const ALLOWED_ROLES = new Set(["admin", "moderator"]);

serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflightResponse(req);
  const corsHeaders = buildCorsHeaders(req);

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status,
    });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

    const authHeader = req.headers.get("Authorization");
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader ?? "" } },
    });
    const service = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false },
    });

    const gate = await requireAdmin(authHeader, userClient, service);
    if (!gate.ok) return json({ error: gate.error }, gate.status);
    const user = { id: gate.userId };

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

        // Mirror the user-facing delete-account flow: cancel live Stripe
        // subscriptions first so a removed user doesn't keep getting billed,
        // then clear user-scoped rows, then drop auth.users. We fail-closed
        // on the Stripe step — half-deleting a paying customer leaks
        // recurring revenue and confuses the webhook reconciliation later.
        const { data: targetProfile, error: targetProfileErr } = await service
          .from("profiles")
          .select("stripe_customer_id")
          .eq("user_id", userId)
          .maybeSingle();
        if (targetProfileErr) {
          console.error("[admin-users] target profile lookup failed:", targetProfileErr.message);
          return json({ error: "profile_lookup_failed" }, 500);
        }
        const targetCustomerId =
          (targetProfile?.stripe_customer_id as string | null | undefined) ?? null;

        const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
        if (targetCustomerId && stripeKey) {
          try {
            const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
            const cancelResult = await cancelActiveSubscriptions(stripe, targetCustomerId);
            if (!isFullyCancelled(cancelResult)) {
              console.error(
                "[admin-users] Stripe cancellation incomplete:",
                JSON.stringify(cancelResult.errors),
              );
              return json({ error: "stripe_cancel_failed" }, 500);
            }
            if (cancelResult.cancelled.length > 0) {
              console.log(
                `[admin-users] cancelled ${cancelResult.cancelled.length} sub(s) for ${targetCustomerId}: ${cancelResult.cancelled.join(", ")}`,
              );
            }
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            console.error("[admin-users] Stripe list/cancel threw:", msg);
            return json({ error: "stripe_cancel_failed" }, 500);
          }
        } else if (targetCustomerId && !stripeKey) {
          console.error("[admin-users] customer present but STRIPE_SECRET_KEY missing — refusing delete");
          return json({ error: "server_misconfigured" }, 500);
        }

        await deleteUserData(service, userId);

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
