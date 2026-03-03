import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { event_id, table_size = 8 } = await req.json();
    if (!event_id) throw new Error("event_id is required");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Get all attendees (members + guests)
    const { data: registrations } = await supabase
      .from("event_registrations")
      .select("member_id")
      .eq("event_id", event_id)
      .in("status", ["aangemeld", "bevestigd", "aanwezig"]);

    const { data: guests } = await supabase
      .from("event_guests")
      .select("id")
      .eq("event_id", event_id)
      .in("status", ["aangemeld", "bevestigd", "aanwezig"]);

    const memberIds = (registrations || []).map(r => r.member_id);
    const guestIds = (guests || []).map(g => g.id);
    const totalAttendees = memberIds.length + guestIds.length;

    if (totalAttendees === 0) throw new Error("Geen deelnemers gevonden");

    // Get rounds
    const { data: rounds } = await supabase
      .from("event_rounds")
      .select("*")
      .eq("event_id", event_id)
      .order("round_number");

    if (!rounds || rounds.length === 0) throw new Error("Geen rondes gevonden. Voeg eerst rondes toe.");

    // Get meeting history for these members
    const { data: history } = await supabase
      .from("meeting_history")
      .select("member_a_id, member_b_id, event_id")
      .or(memberIds.map(id => `member_a_id.eq.${id},member_b_id.eq.${id}`).join(","));

    // Build pairwise meeting count map
    const meetingCounts: Record<string, number> = {};
    const pairKey = (a: string, b: string) => a < b ? `${a}|${b}` : `${b}|${a}`;
    (history || []).forEach(h => {
      const key = pairKey(h.member_a_id, h.member_b_id);
      meetingCounts[key] = (meetingCounts[key] || 0) + 1;
    });

    const numTables = Math.ceil(totalAttendees / table_size);
    const allSeatingAssignments: any[] = [];
    const roundAssignments: Record<string, string[][]> = {}; // roundId -> tables of member arrays

    // For each round, generate seating using greedy + local search
    for (const round of rounds) {
      // Clear existing tables and seats for this round
      const { data: existingTables } = await supabase.from("event_tables").select("id").eq("round_id", round.id);
      if (existingTables && existingTables.length > 0) {
        await supabase.from("table_seats").delete().in("table_id", existingTables.map(t => t.id));
        await supabase.from("event_tables").delete().eq("round_id", round.id);
      }

      // Shuffle attendees
      const attendees = [...memberIds, ...guestIds.map(g => `guest:${g}`)];
      for (let i = attendees.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [attendees[i], attendees[j]] = [attendees[j], attendees[i]];
      }

      // Create tables
      const tables: string[][] = Array.from({ length: numTables }, () => []);
      
      // Greedy assignment: place each person at the table with fewest existing meetings
      for (const person of attendees) {
        let bestTable = 0;
        let bestScore = Infinity;
        for (let t = 0; t < numTables; t++) {
          if (tables[t].length >= table_size) continue;
          let score = 0;
          for (const existing of tables[t]) {
            if (!person.startsWith("guest:") && !existing.startsWith("guest:")) {
              score += meetingCounts[pairKey(person, existing)] || 0;
            }
            // Also check within-event previous rounds
            for (const prevRoundId of Object.keys(roundAssignments)) {
              const prevTables = roundAssignments[prevRoundId];
              for (const prevTable of prevTables) {
                if (prevTable.includes(person) && prevTable.includes(existing)) {
                  score += 10; // Heavy penalty for same table in same event
                }
              }
            }
          }
          if (score < bestScore) { bestScore = score; bestTable = t; }
        }
        tables[bestTable].push(person);
      }

      // Local search: try random swaps to improve
      for (let iter = 0; iter < 500; iter++) {
        const t1 = Math.floor(Math.random() * numTables);
        const t2 = Math.floor(Math.random() * numTables);
        if (t1 === t2 || tables[t1].length === 0 || tables[t2].length === 0) continue;
        const i1 = Math.floor(Math.random() * tables[t1].length);
        const i2 = Math.floor(Math.random() * tables[t2].length);

        const scoreBefore = tableScore(tables[t1], meetingCounts, pairKey, roundAssignments)
          + tableScore(tables[t2], meetingCounts, pairKey, roundAssignments);
        [tables[t1][i1], tables[t2][i2]] = [tables[t2][i2], tables[t1][i1]];
        const scoreAfter = tableScore(tables[t1], meetingCounts, pairKey, roundAssignments)
          + tableScore(tables[t2], meetingCounts, pairKey, roundAssignments);
        if (scoreAfter >= scoreBefore) {
          [tables[t1][i1], tables[t2][i2]] = [tables[t2][i2], tables[t1][i1]]; // Swap back
        }
      }

      roundAssignments[round.id] = tables;

      // Save to DB
      for (let t = 0; t < tables.length; t++) {
        if (tables[t].length === 0) continue;
        const { data: tableRow } = await supabase.from("event_tables").insert({
          round_id: round.id, table_number: t + 1, table_name: `Tafel ${t + 1}`, capacity: table_size,
        }).select().single();

        if (tableRow) {
          const seats = tables[t].map((person, idx) => ({
            table_id: tableRow.id,
            member_id: person.startsWith("guest:") ? null : person,
            guest_id: person.startsWith("guest:") ? person.replace("guest:", "") : null,
            seat_number: idx + 1,
          }));
          await supabase.from("table_seats").insert(seats);
        }
      }

      // Record meeting history for member pairs
      const meetingRecords: any[] = [];
      for (const table of tables) {
        const membersOnly = table.filter(p => !p.startsWith("guest:"));
        for (let i = 0; i < membersOnly.length; i++) {
          for (let j = i + 1; j < membersOnly.length; j++) {
            const a = membersOnly[i] < membersOnly[j] ? membersOnly[i] : membersOnly[j];
            const b = membersOnly[i] < membersOnly[j] ? membersOnly[j] : membersOnly[i];
            meetingRecords.push({ member_a_id: a, member_b_id: b, event_id, round_id: round.id });
            const key = pairKey(a, b);
            meetingCounts[key] = (meetingCounts[key] || 0) + 1;
          }
        }
      }
      if (meetingRecords.length > 0) {
        await supabase.from("meeting_history").insert(meetingRecords);
      }
    }

    // Calculate quality score
    let totalNewMeetings = 0;
    let totalRepeats = 0;
    for (const roundId of Object.keys(roundAssignments)) {
      for (const table of roundAssignments[roundId]) {
        const membersOnly = table.filter(p => !p.startsWith("guest:"));
        for (let i = 0; i < membersOnly.length; i++) {
          for (let j = i + 1; j < membersOnly.length; j++) {
            const key = pairKey(membersOnly[i], membersOnly[j]);
            if ((meetingCounts[key] || 0) <= 1) totalNewMeetings++;
            else totalRepeats++;
          }
        }
      }
    }

    const totalPairs = totalNewMeetings + totalRepeats;
    const score = totalPairs > 0 ? Math.round((totalNewMeetings / totalPairs) * 100) : 100;

    // Save seating version
    const { data: latestVersion } = await supabase.from("seating_versions")
      .select("version_number").eq("event_id", event_id).order("version_number", { ascending: false }).limit(1);
    const nextVersion = (latestVersion && latestVersion.length > 0 ? latestVersion[0].version_number : 0) + 1;

    await supabase.from("seating_versions").insert({
      event_id, version_number: nextVersion, status: "concept",
      score, score_details: { new_meetings: totalNewMeetings, repeats: totalRepeats, total_pairs: totalPairs },
      snapshot: roundAssignments,
    });

    return new Response(JSON.stringify({
      success: true, score, new_meetings: totalNewMeetings, repeats: totalRepeats,
      message: `Indeling versie ${nextVersion} gegenereerd. Score: ${score}% (${totalNewMeetings} nieuwe ontmoetingen, ${totalRepeats} herhalingen).`,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function tableScore(
  table: string[],
  meetingCounts: Record<string, number>,
  pairKey: (a: string, b: string) => string,
  roundAssignments: Record<string, string[][]>
): number {
  let score = 0;
  for (let i = 0; i < table.length; i++) {
    for (let j = i + 1; j < table.length; j++) {
      if (!table[i].startsWith("guest:") && !table[j].startsWith("guest:")) {
        score += meetingCounts[pairKey(table[i], table[j])] || 0;
      }
      for (const prevTables of Object.values(roundAssignments)) {
        for (const prevTable of prevTables) {
          if (prevTable.includes(table[i]) && prevTable.includes(table[j])) score += 10;
        }
      }
    }
  }
  return score;
}
