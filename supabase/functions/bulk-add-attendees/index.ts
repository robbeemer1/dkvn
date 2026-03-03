import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Niet ingelogd");

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Verify caller is super_admin
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) throw new Error("Niet ingelogd");

    const { data: isAdmin } = await supabaseAdmin.rpc("is_super_admin", { _user_id: user.id });
    if (!isAdmin) throw new Error("Geen toegang");

    const { event_id, matched_ids, guests } = await req.json();
    if (!event_id) throw new Error("event_id is verplicht");

    let addedCount = 0;

    // 1. Add matched member registrations
    if (matched_ids?.length > 0) {
      const inserts = matched_ids.map((mid: string) => ({
        event_id,
        member_id: mid,
      }));
      const { error } = await supabaseAdmin.from("event_registrations").upsert(inserts, { onConflict: "event_id,member_id" });
      if (error) throw error;
      addedCount += matched_ids.length;
    }

    // 2. Create guest profiles + registrations
    if (guests?.length > 0) {
      for (const guest of guests) {
        const { data: profile, error: pErr } = await supabaseAdmin
          .from("profiles")
          .insert({
            id: crypto.randomUUID(),
            first_name: guest.first_name,
            last_name: guest.last_name,
            membership_level: "gast",
          })
          .select("id")
          .single();

        if (pErr) {
          console.error("Profile error:", pErr.message);
          continue;
        }

        await supabaseAdmin.from("event_registrations").upsert(
          { event_id, member_id: profile.id },
          { onConflict: "event_id,member_id" }
        );
        addedCount++;
      }
    }

    return new Response(JSON.stringify({ success: true, added: addedCount }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
