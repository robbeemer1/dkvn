import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const NAME_ALIASES: Record<string, string> = {
  "Erik": "Erik van Ramshorst",
  "Frank": "Frank Rigter",
  "Germa": "Germa Versteijen",
  "Goos": "Goos Terschegget",
  "Jorien": "Jorien Mira Crusius",
  "Mireille": "Mireille Hoekstra",
  "Urschi": "Urschi Koetje",
  "Lieselore": "Lieselore van Dijkhuizen",
  "Germa Versteijnen": "Germa Versteijen",
  "Rémon Van Beek": "Rémon van Beek",
  "Marianne v Heemskerk": "Marianne Heemskerk",
  "Marianne van Heemskerk": "Marianne Heemskerk",
  "Charel Karman": "Charel Karman-van den Hul",
};

function normalizeName(name: string): string {
  let n = name.replace(/\s+/g, " ").trim();
  if (NAME_ALIASES[n]) n = NAME_ALIASES[n];
  return n;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { events } = await req.json();
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Build name -> id map from existing profiles
    const { data: profiles } = await supabase.from("profiles").select("id, first_name, last_name");
    const profileMap: Record<string, string> = {};
    for (const p of profiles || []) {
      profileMap[`${p.first_name} ${p.last_name}`.trim()] = p.id;
    }

    const { data: regions } = await supabase.from("regions").select("id, name");
    const regionMap: Record<string, string> = {};
    for (const r of regions || []) regionMap[r.name] = r.id;

    const results: string[] = [];
    let totalPairs = 0;
    const unresolved: string[] = [];

    for (const event of events) {
      let regionId = regionMap["Amersfoort"];
      const nl = event.name.toLowerCase();
      if (nl.includes("meern") || nl.includes("nefkens")) regionId = regionMap["Amsterdam"];
      else if (nl.includes("veluwemeer") || nl.includes("postillion")) regionId = regionMap["Amersfoort"];
      else if (nl.includes("apeldoorn") || nl.includes("echoput")) regionId = regionMap["Apeldoorn"];

      const { data: eventRow, error: ee } = await supabase.from("events").insert({
        title: event.name, event_date: event.date, region_id: regionId, is_published: true,
      }).select().single();
      if (ee || !eventRow) { results.push(`ERROR event ${event.name}: ${ee?.message}`); continue; }
      results.push(`Event: ${event.name}`);

      for (const round of event.rounds) {
        const { data: roundRow } = await supabase.from("event_rounds").insert({
          event_id: eventRow.id, round_number: round.round, name: `Ronde ${round.round}`,
        }).select().single();
        if (!roundRow) continue;

        const pairs: [string, string][] = [];
        const allAttendeeIds = new Set<string>();

        if (event.format === "tables") {
          for (const [tName, members] of Object.entries(round.tables) as [string, string[]][]) {
            const normalized = members.map(normalizeName);
            const tableNum = parseInt(tName.replace("T", "")) || 1;
            const { data: tableRow } = await supabase.from("event_tables").insert({
              round_id: roundRow.id, table_number: tableNum, table_name: `Tafel ${tableNum}`, capacity: Math.max(normalized.length, 8),
            }).select().single();

            if (tableRow) {
              const seats = normalized.map((name, idx) => {
                const mid = profileMap[name];
                if (!mid && !unresolved.includes(name)) unresolved.push(name);
                return mid ? { table_id: tableRow.id, member_id: mid, seat_number: idx + 1 } : null;
              }).filter(Boolean);
              if (seats.length > 0) await supabase.from("table_seats").insert(seats);
            }

            for (const name of normalized) {
              const id = profileMap[name];
              if (id) allAttendeeIds.add(id);
            }

            for (let i = 0; i < normalized.length; i++) {
              for (let j = i + 1; j < normalized.length; j++) {
                if (profileMap[normalized[i]] && profileMap[normalized[j]]) {
                  pairs.push([normalized[i], normalized[j]]);
                }
              }
            }
          }
        } else if (event.format === "pairs") {
          for (const pair of round.pairs as string[][]) {
            const a = normalizeName(pair[0]);
            const b = normalizeName(pair[1]);
            if (profileMap[a] && profileMap[b]) pairs.push([a, b]);
            else {
              if (!profileMap[a] && !unresolved.includes(a)) unresolved.push(a);
              if (!profileMap[b] && !unresolved.includes(b)) unresolved.push(b);
            }
            if (profileMap[a]) allAttendeeIds.add(profileMap[a]);
            if (profileMap[b]) allAttendeeIds.add(profileMap[b]);
          }
        }

        // Registrations
        const regInserts = [...allAttendeeIds].map(mid => ({
          event_id: eventRow.id, member_id: mid, status: "aanwezig" as const,
        }));
        if (regInserts.length > 0) {
          for (const ri of regInserts) {
            await supabase.from("event_registrations").upsert(ri, { onConflict: "event_id,member_id" });
          }
        }

        // Meeting history
        const seen = new Set<string>();
        const meetings = pairs.map(([nA, nB]) => {
          const idA = profileMap[nA]!;
          const idB = profileMap[nB]!;
          const [a, b] = idA < idB ? [idA, idB] : [idB, idA];
          const key = `${a}|${b}`;
          if (seen.has(key)) return null;
          seen.add(key);
          return { member_a_id: a, member_b_id: b, event_id: eventRow.id, round_id: roundRow.id, met_at: event.date + "T12:00:00Z" };
        }).filter(Boolean);

        for (let i = 0; i < meetings.length; i += 200) {
          const batch = meetings.slice(i, i + 200);
          await supabase.from("meeting_history").insert(batch);
        }
        totalPairs += meetings.length;
        results.push(`  Ronde ${round.round}: ${meetings.length} ontmoetingen`);
      }
    }

    return new Response(JSON.stringify({ success: true, results, totalPairs, unresolved }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
