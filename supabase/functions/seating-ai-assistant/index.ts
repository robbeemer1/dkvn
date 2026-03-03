import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { event_id, question } = await req.json();
    if (!event_id) throw new Error("event_id is required");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    // Gather event context
    const { data: event } = await supabase.from("events").select("*, regions(name)").eq("id", event_id).single();
    const { data: registrations } = await supabase
      .from("event_registrations")
      .select("member_id, status, profiles:member_id(first_name, last_name, membership_level)")
      .eq("event_id", event_id);
    const { data: rounds } = await supabase
      .from("event_rounds")
      .select("*, event_tables(*, table_seats(member_id, guest_id))")
      .eq("event_id", event_id)
      .order("round_number");
    const { data: versions } = await supabase
      .from("seating_versions")
      .select("version_number, status, score, score_details")
      .eq("event_id", event_id)
      .order("version_number", { ascending: false })
      .limit(3);

    const context = `
Event: ${event?.title} (${event?.regions?.name}, ${event?.event_date})
Deelnemers: ${registrations?.length || 0} leden
Rondes: ${rounds?.length || 0}
${versions?.length ? `Laatste versies: ${versions.map(v => `v${v.version_number} score:${v.score} (${v.status})`).join(", ")}` : "Geen versies"}
${rounds?.map(r => `Ronde ${r.round_number}: ${r.event_tables?.length || 0} tafels`).join("\n") || ""}
    `.trim();

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content: `Je bent een AI-assistent voor "De Kunst van Netwerken", een netwerkclub. Je helpt met het analyseren en verbeteren van tafelindelingen voor events. Je geeft advies in het Nederlands. Je focust op:
- Maximaliseren van nieuwe ontmoetingen
- Minimaliseren van herhalingen
- Eerlijke verdeling van VIP/goud-leden over tafels
- Mix van regio's
- Kwaliteitsscore en concrete verbetervoorstellen
Geef GEEN privacygevoelige informatie. Gebruik alleen data die je krijgt.`
          },
          { role: "user", content: `Context:\n${context}\n\nVraag: ${question || "Analyseer de huidige tafelindeling."}` },
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit bereikt. Probeer later opnieuw." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Geen AI-credits meer. Voeg credits toe." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error("AI gateway error");
    }

    const aiResult = await response.json();
    const answer = aiResult.choices?.[0]?.message?.content || "Geen antwoord ontvangen.";

    return new Response(JSON.stringify({ answer }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
