import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
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

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) throw new Error("Niet ingelogd");

    const { event_id, matched_ids = [], guests = [] } = await req.json();
    if (!event_id) throw new Error("event_id is verplicht");

    const { data: eventRow, error: eventError } = await supabaseAdmin
      .from("events")
      .select("id, region_id")
      .eq("id", event_id)
      .single();
    if (eventError || !eventRow) throw new Error("Event niet gevonden");

    const [{ data: isAdmin }, { data: isOrganizer }, { data: isRegionAdmin }] = await Promise.all([
      supabaseAdmin.rpc("is_super_admin", { _user_id: user.id }),
      supabaseAdmin.rpc("is_event_organizer", { _user_id: user.id, _event_id: event_id }),
      supabaseAdmin.rpc("has_role_in_region", { _user_id: user.id, _role: "region_admin", _region_id: eventRow.region_id }),
    ]);

    if (!(isAdmin || isOrganizer || isRegionAdmin)) throw new Error("Geen toegang");

    let addedCount = 0;
    const failedGuests: string[] = [];

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

    // 2. Create guest auth users + guest profiles + register them
    if (guests?.length > 0) {
      for (const guest of guests) {
        const tempId = crypto.randomUUID();
        const guestEmail = `guest.${tempId}@no-login.local`;
        const tempPassword = `${crypto.randomUUID()}Aa1!`;

        const { data: createdUser, error: userErr } = await supabaseAdmin.auth.admin.createUser({
          email: guestEmail,
          password: tempPassword,
          email_confirm: true,
          user_metadata: {
            first_name: guest.first_name,
            last_name: guest.last_name,
          },
        });

        if (userErr || !createdUser?.user?.id) {
          console.error("Guest auth create error:", userErr?.message || "unknown error");
          failedGuests.push(`${guest.first_name} ${guest.last_name}`);
          continue;
        }

        const guestId = createdUser.user.id;

        const { error: pErr } = await supabaseAdmin
          .from("profiles")
          .upsert(
            {
              id: guestId,
              first_name: guest.first_name,
              last_name: guest.last_name,
              membership_level: "gast",
            },
            { onConflict: "id" }
          );

        if (pErr) {
          console.error("Profile create error:", pErr.message);
          failedGuests.push(`${guest.first_name} ${guest.last_name}`);
          continue;
        }

        const { error: rErr } = await supabaseAdmin
          .from("event_registrations")
          .upsert(
            { event_id, member_id: guestId },
            { onConflict: "event_id,member_id" }
          );

        if (rErr) {
          console.error("Registration error:", rErr.message);
          failedGuests.push(`${guest.first_name} ${guest.last_name}`);
          continue;
        }

        addedCount++;
      }
    }

    return new Response(JSON.stringify({
      success: failedGuests.length === 0,
      added: addedCount,
      failed: failedGuests,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
