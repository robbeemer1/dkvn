import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify the calling user is a super_admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Niet geautoriseerd" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Verify caller using JWT claims (no server-side session check)
    const callerClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await callerClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Niet geautoriseerd" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const callerId = claimsData.claims.sub;

    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    // Check super_admin role
    const { data: hasRole } = await adminClient.rpc("is_super_admin", { _user_id: callerId });
    if (!hasRole) {
      return new Response(JSON.stringify({ error: "Alleen super admins kunnen gebruikers uitnodigen" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { email, role, forceReinvite } = await req.json();
    if (!email) {
      return new Response(JSON.stringify({ error: "E-mailadres is verplicht" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Check if user already exists in profiles
    const { data: existingProfile } = await adminClient
      .from("profiles")
      .select("id")
      .eq("email", normalizedEmail)
      .maybeSingle();

    if (existingProfile && !forceReinvite) {
      return new Response(JSON.stringify({ error: "exists", user_id: existingProfile.id }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // If forceReinvite or user exists in auth but not profiles, clean up old auth user
    if (existingProfile) {
      // Delete old profile and auth user so we can re-invite cleanly
      await adminClient.from("user_roles").delete().eq("user_id", existingProfile.id);
      await adminClient.from("profiles").delete().eq("id", existingProfile.id);
      await adminClient.auth.admin.deleteUser(existingProfile.id);
    } else {
      // Profile doesn't exist but auth user might (edge case)
      // Try to find auth user by email and clean up
      const { data: { users } } = await adminClient.auth.admin.listUsers();
      const existingAuthUser = users?.find(u => u.email === normalizedEmail);
      if (existingAuthUser) {
        await adminClient.from("user_roles").delete().eq("user_id", existingAuthUser.id);
        await adminClient.from("profiles").delete().eq("id", existingAuthUser.id);
        await adminClient.auth.admin.deleteUser(existingAuthUser.id);
      }
    }

    // Invite user - this sends an invitation email
    const redirectUrl = req.headers.get("origin") || req.headers.get("referer")?.replace(/\/[^/]*$/, "") || "https://dkvn.lovable.app";
    
    const { data: inviteData, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(normalizedEmail, {
      redirectTo: `${redirectUrl}/reset-password`,
    });

    if (inviteError) {
      return new Response(JSON.stringify({ error: inviteError.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const newUserId = inviteData.user.id;

    // Add role
    if (role) {
      await adminClient.from("user_roles").insert({
        user_id: newUserId,
        role: role,
      });
    }

    return new Response(JSON.stringify({ success: true, user_id: newUserId }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
