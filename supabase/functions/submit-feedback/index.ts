import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { type, message } = await req.json();

    // Validate input
    if (!type || !message) {
      return new Response(JSON.stringify({ error: "Missing type or message" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const validTypes = ["feature", "improvement", "bug"];
    if (!validTypes.includes(type)) {
      return new Response(JSON.stringify({ error: "Invalid feedback type" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (typeof message !== "string" || message.trim().length === 0 || message.length > 2000) {
      return new Response(JSON.stringify({ error: "Message must be 1-2000 characters" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminEmail = Deno.env.get("ADMIN_EMAIL");

    // Extract user if authenticated
    const authHeader = req.headers.get("authorization");
    let userId: string | null = null;
    let userEmail: string | null = null;

    if (authHeader) {
      const anonKey = Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
      const userClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { authorization: authHeader } },
      });
      const { data: { user } } = await userClient.auth.getUser();
      if (user) {
        userId = user.id;
        userEmail = user.email ?? null;
      }
    }

    // Store feedback using service role (bypasses RLS for anon insert)
    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { error: insertError } = await adminClient
      .from("feedback")
      .insert({
        user_id: userId,
        type: type.trim(),
        message: message.trim(),
      });

    if (insertError) {
      console.error("Insert error:", insertError);
      return new Response(JSON.stringify({ error: "Failed to store feedback" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Notify admin via Lovable AI gateway (simple email-like notification logged)
    if (adminEmail) {
      console.log(
        `[FEEDBACK] To: ${adminEmail} | Type: ${type} | From: ${userEmail ?? "anonymous"} | Message: ${message.trim()}`
      );
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Feedback error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
