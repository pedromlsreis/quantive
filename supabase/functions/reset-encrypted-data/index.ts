import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { buildCorsHeaders, corsPreflightResponse } from "../_shared/cors.ts";
import { checkRateLimit, extractIp } from "../_shared/rateLimit.ts";
import { hasRecentEmailLinkAuth } from "../_shared/emailLinkAuth.ts";
import { deleteUserData, ENCRYPTED_DATA_TABLES, releaseOwnedPortfolios } from "../_shared/userDataDelete.ts";

// Deletes the caller's encrypted portfolio and key rows so they can start
// again after a password reset without a recovery code (encryption.md §8.5).
// By then the data can't be decrypted by anyone; without this the old key
// row stays wrapped under the old password and every later unlock fails.
serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflightResponse(req);
  const corsHeaders = buildCorsHeaders(req);

  const errorResponse = (code: string, status: number, extraHeaders: Record<string, string> = {}) =>
    new Response(JSON.stringify({ error: code }), {
      headers: { ...corsHeaders, "Content-Type": "application/json", ...extraHeaders },
      status,
    });

  try {
    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } },
    );

    const ip = extractIp(req);
    const rate = await checkRateLimit(serviceClient, { ip, bucket: "reset-encrypted-data", maxRequests: 5, windowSeconds: 60 });
    if (!rate.allowed) {
      return errorResponse("rate_limited", 429, { "Retry-After": String(rate.retryAfter) });
    }

    const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "").trim();
    if (!token) return errorResponse("unauthenticated", 401);

    const anonClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    );
    const { data: { user }, error: authError } = await anonClient.auth.getUser(token);
    if (authError || !user) return errorResponse("unauthenticated", 401);

    // The reset page holds a session opened from the emailed link. A session
    // opened with a password (possibly a stolen one) can't wipe data.
    if (!hasRecentEmailLinkAuth(token, Math.floor(Date.now() / 1000))) {
      return errorResponse("email_link_required", 403);
    }

    // A shared portfolio passes to the partner, who can still open it.
    const release = await releaseOwnedPortfolios(serviceClient, user.id);
    if (release.error) {
      console.error(`[reset-encrypted-data] release failed for ${user.id}:`, release.error);
      return errorResponse("cleanup_failed", 500);
    }

    // One table at a time, stopping at the first failure (see ENCRYPTED_DATA_TABLES).
    for (const table of ENCRYPTED_DATA_TABLES) {
      const { errors } = await deleteUserData(serviceClient, user.id, [table]);
      if (errors.length > 0) {
        console.error(`[reset-encrypted-data] delete failed for ${user.id}:`, JSON.stringify(errors));
        return errorResponse("cleanup_failed", 500);
      }
    }
    console.log(`[reset-encrypted-data] cleared encrypted data for ${user.id}`);

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (err) {
    console.error("[reset-encrypted-data] error:", err);
    return errorResponse("internal_error", 500);
  }
});
