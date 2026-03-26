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
  "Ber Moolenaar": "Ber Moolenaar-Thomas",
  "Floris Kok - gast van Ber": "Floris Kok",
  "Lettie McKay": "Lettie Mackay",
  "Hilde Van Ginhoven": "Hilde van Ginhoven",
  "Raquel Alcaraz Koster": "Raquel Koster-Alcaraz",
  "Raquel Alcaraz-Koster": "Raquel Koster-Alcaraz",
  "Irene Koers": "Irene Koers-Schots",
};

function normalizeName(name: string): string {
  let n = name.replace(/\s+/g, " ").trim();
  if (NAME_ALIASES[n]) n = NAME_ALIASES[n];
  return n;
}

function splitName(full: string): { first: string; last: string } {
  const parts = full.split(" ");
  return { first: parts[0], last: parts.slice(1).join(" ") || "" };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { events } = await req.json();
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Build name -> id map from existing profiles (case-insensitive)
    const { data: profiles } = await supabase.from("profiles").select("id, first_name, last_name");
    const profileMap: Record<string, string> = {};
    const profileMapLower: Record<string, string> = {};
    for (const p of profiles || []) {
      const full = `${p.first_name} ${p.last_name}`.trim();
      profileMap[full] = p.id;
      profileMapLower[full.toLowerCase()] = p.id;
    }

    function resolveId(name: string): string | null {
      return profileMap[name] || profileMapLower[name.toLowerCase()] || null;
    }

    const { data: regions } = await supabase.from("regions").select("id, name");
    const regionMap: Record<string, string> = {};
    for (const r of regions || []) regionMap[r.name] = r.id;

    // Check existing events to avoid duplicates
    const { data: existingEvents } = await supabase.from("events").select("title, event_date");
    const existingEventSet = new Set((existingEvents || []).map(e => `${e.title}|${e.event_date}`));

    // First pass: collect all unique names and create missing profiles
    const allNames = new Set<string>();
    for (const event of events) {
      for (const round of event.rounds) {
        if (round.pairs) for (const pair of round.pairs) pair.forEach((n: string) => allNames.add(normalizeName(n)));
        if (round.tables) for (const members of Object.values(round.tables)) (members as string[]).forEach(n => allNames.add(normalizeName(n)));
        if (round.groups) for (const members of Object.values(round.groups)) (members as string[]).forEach(n => allNames.add(normalizeName(n)));
      }
    }

    const createdProfiles: string[] = [];
    for (const name of allNames) {
      if (resolveId(name)) continue;

      const { first, last } = splitName(name);
      const tempId = crypto.randomUUID();
      const guestEmail = `guest.${tempId}@no-login.local`;
      const tempPassword = `${crypto.randomUUID()}Aa1!`;

      const { data: createdUser, error: userErr } = await supabase.auth.admin.createUser({
        email: guestEmail,
        password: tempPassword,
        email_confirm: true,
        user_metadata: { first_name: first, last_name: last },
      });

      if (userErr || !createdUser?.user?.id) {
        createdProfiles.push(`FAILED: ${name} - ${userErr?.message}`);
        continue;
      }

      const guestId = createdUser.user.id;
      await supabase.from("profiles").upsert({
        id: guestId, first_name: first, last_name: last,
        membership_level: "gastlid", is_active: true,
      }, { onConflict: "id" });

      profileMap[name] = guestId;
      profileMapLower[name.toLowerCase()] = guestId;
      createdProfiles.push(`OK: ${name}`);
    }

    const results: string[] = [];
    let totalPairs = 0;
    const unresolved: string[] = [];

    for (const event of events) {
      const checkKey = `${event.name}|${event.date}`;
      if (existingEventSet.has(checkKey)) {
        results.push(`SKIP (exists): ${event.name} (${event.date})`);
        continue;
      }

      let regionId = regionMap["Amersfoort"] || Object.values(regionMap)[0];
      const nl = event.name.toLowerCase();
      if (nl.includes("meern") || nl.includes("nefkens") || nl.includes("schiphol") || nl.includes("aalsmeer") || nl.includes("amsterdam")) {
        regionId = regionMap["Amsterdam"] || regionId;
      } else if (nl.includes("veluwemeer") || nl.includes("postillion") || nl.includes("almere") || nl.includes("zuiderzoet")) {
        regionId = regionMap["Amersfoort"] || regionId;
      } else if (nl.includes("apeldoorn") || nl.includes("echoput")) {
        regionId = regionMap["Apeldoorn"] || regionId;
      }

      const { data: eventRow, error: ee } = await supabase.from("events").insert({
        title: event.name, event_date: event.date, region_id: regionId, is_published: true,
      }).select().single();
      if (ee || !eventRow) { results.push(`ERROR event ${event.name}: ${ee?.message}`); continue; }
      results.push(`Event: ${event.name}`);

      const allAttendeeIds = new Set<string>();

      for (const round of event.rounds) {
        const { data: roundRow } = await supabase.from("event_rounds").insert({
          event_id: eventRow.id, round_number: round.round, name: `Ronde ${round.round}`,
        }).select().single();
        if (!roundRow) continue;

        const pairs: [string, string][] = [];

        // Handle pairs
        if (round.pairs) {
          for (const pair of round.pairs) {
            const a = normalizeName(pair[0]);
            const b = normalizeName(pair[1]);
            const aid = resolveId(a);
            const bid = resolveId(b);
            if (aid && bid) {
              pairs.push([aid, bid]);
              allAttendeeIds.add(aid);
              allAttendeeIds.add(bid);
            } else {
              if (!aid && !unresolved.includes(a)) unresolved.push(a);
              if (!bid && !unresolved.includes(b)) unresolved.push(b);
            }
          }
        }

        // Handle tables
        if (round.tables) {
          for (const [tName, members] of Object.entries(round.tables) as [string, string[]][]) {
            const resolved = members.map(normalizeName);
            const ids: string[] = [];
            for (const name of resolved) {
              const mid = resolveId(name);
              if (mid) { ids.push(mid); allAttendeeIds.add(mid); }
              else if (!unresolved.includes(name)) unresolved.push(name);
            }
            for (let i = 0; i < ids.length; i++) {
              for (let j = i + 1; j < ids.length; j++) {
                pairs.push([ids[i], ids[j]]);
              }
            }
          }
        }

        // Handle groups (same logic as tables)
        if (round.groups) {
          for (const [gName, members] of Object.entries(round.groups) as [string, string[]][]) {
            const resolved = members.map(normalizeName);
            const ids: string[] = [];
            for (const name of resolved) {
              const mid = resolveId(name);
              if (mid) { ids.push(mid); allAttendeeIds.add(mid); }
              else if (!unresolved.includes(name)) unresolved.push(name);
            }
            for (let i = 0; i < ids.length; i++) {
              for (let j = i + 1; j < ids.length; j++) {
                pairs.push([ids[i], ids[j]]);
              }
            }
          }
        }

        // Deduplicate and insert meeting history
        const seen = new Set<string>();
        const meetings = pairs.map(([idA, idB]) => {
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

      // Registrations
      for (const mid of allAttendeeIds) {
        await supabase.from("event_registrations").upsert(
          { event_id: eventRow.id, member_id: mid, status: "aanwezig" as const },
          { onConflict: "event_id,member_id" }
        );
      }
    }

    return new Response(JSON.stringify({ success: true, results, totalPairs, unresolved, createdProfiles }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
