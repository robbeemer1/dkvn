import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { version_id } = await req.json();
    if (!version_id) throw new Error("version_id is required");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Get the version
    const { data: version, error: vErr } = await supabase
      .from("seating_versions")
      .select("*")
      .eq("id", version_id)
      .single();
    if (vErr || !version) throw new Error("Versie niet gevonden");

    const snapshot = version.snapshot as any;
    if (!snapshot?.rounds || !Array.isArray(snapshot.rounds)) {
      throw new Error("Snapshot heeft geen geldig formaat (verwacht 'rounds' array)");
    }

    const eventId = version.event_id;

    // Get all current rounds for this event
    const { data: currentRounds } = await supabase
      .from("event_rounds")
      .select("id")
      .eq("event_id", eventId);

    // Delete all current seats and tables for all rounds
    if (currentRounds && currentRounds.length > 0) {
      for (const round of currentRounds) {
        const { data: tables } = await supabase
          .from("event_tables")
          .select("id")
          .eq("round_id", round.id);
        if (tables && tables.length > 0) {
          await supabase.from("table_seats").delete().in("table_id", tables.map(t => t.id));
          await supabase.from("event_tables").delete().eq("round_id", round.id);
        }
      }
    }

    // Restore from snapshot
    for (const roundSnapshot of snapshot.rounds) {
      // Find the matching round by round_number (rounds themselves are not deleted)
      const { data: matchingRound } = await supabase
        .from("event_rounds")
        .select("id")
        .eq("event_id", eventId)
        .eq("round_number", roundSnapshot.round_number)
        .single();

      if (!matchingRound) continue;

      for (const tableSnapshot of roundSnapshot.tables || []) {
        const { data: tableRow } = await supabase
          .from("event_tables")
          .insert({
            round_id: matchingRound.id,
            table_number: tableSnapshot.table_number,
            table_name: tableSnapshot.table_name || `Tafel ${tableSnapshot.table_number}`,
            capacity: tableSnapshot.capacity || 8,
            host_member_id: tableSnapshot.host_member_id || null,
          })
          .select()
          .single();

        if (tableRow && tableSnapshot.seats?.length > 0) {
          const seats = tableSnapshot.seats.map((seat: any) => ({
            table_id: tableRow.id,
            member_id: seat.member_id || null,
            guest_id: seat.guest_id || null,
            seat_number: seat.seat_number || null,
          }));
          await supabase.from("table_seats").insert(seats);
        }
      }
    }

    return new Response(
      JSON.stringify({ success: true, message: `Versie ${version.version_number} hersteld.` }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ error: e.message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
