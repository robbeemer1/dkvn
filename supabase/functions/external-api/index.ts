import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
};

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function errorResponse(message: string, status = 400) {
  return jsonResponse({ error: message }, status);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Auth check
  const authHeader = req.headers.get("Authorization");
  const expectedToken = Deno.env.get("EXTERNAL_API_TOKEN");
  if (!expectedToken) return errorResponse("Server misconfigured", 500);
  if (!authHeader || authHeader !== `Bearer ${expectedToken}`) {
    return errorResponse("Unauthorized", 401);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const url = new URL(req.url);
  const pathParts = url.pathname.replace(/^\/external-api\/?/, "").split("/").filter(Boolean);
  const method = req.method;

  try {
    // POST /login  body: { email, password }
    if (pathParts[0] === "login" && method === "POST") {
      const { email, password } = await req.json();
      if (!email || !password) return errorResponse("email and password required");
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) return errorResponse(error.message, 401);
      const userId = data.user.id;
      const { data: profile } = await supabase.from("profiles").select("*, regions(name)").eq("id", userId).single();
      const { data: roles } = await supabase.from("user_roles").select("role, region_id").eq("user_id", userId);
      return jsonResponse({ user_id: userId, email: data.user.email, profile, roles });
    }

    // GET /profile/:uuid
    if (pathParts[0] === "profile" && pathParts[1] && method === "GET") {
      const uuid = pathParts[1];
      const { data: profile, error } = await supabase.from("profiles").select("*, regions(name)").eq("id", uuid).single();
      if (error) return errorResponse("Profile not found", 404);

      // Events where registered
      const { data: registrations } = await supabase
        .from("event_registrations")
        .select("*, events(id, title, event_date, start_time, end_time, location_name, location_address, region_id)")
        .eq("member_id", uuid)
        .order("registered_at", { ascending: false });

      // Meetings
      const { data: meetings } = await supabase
        .from("meeting_history")
        .select("*, events(id, title, event_date)")
        .or(`member_a_id.eq.${uuid},member_b_id.eq.${uuid}`)
        .order("met_at", { ascending: false })
        .limit(100);

      // Enrich meeting partners
      const partnerIds = new Set<string>();
      meetings?.forEach((m: any) => {
        partnerIds.add(m.member_a_id === uuid ? m.member_b_id : m.member_a_id);
      });
      let partnersMap: Record<string, any> = {};
      if (partnerIds.size > 0) {
        const { data: partners } = await supabase
          .from("profiles")
          .select("id, first_name, last_name, company_name")
          .in("id", Array.from(partnerIds));
        partners?.forEach((p: any) => { partnersMap[p.id] = p; });
      }

      const enrichedMeetings = meetings?.map((m: any) => {
        const partnerId = m.member_a_id === uuid ? m.member_b_id : m.member_a_id;
        return { ...m, partner: partnersMap[partnerId] || null };
      });

      return jsonResponse({ profile, registrations, meetings: enrichedMeetings });
    }

    // PUT /profile/:uuid  body: profile fields
    if (pathParts[0] === "profile" && pathParts[1] && method === "PUT") {
      const uuid = pathParts[1];
      const body = await req.json();
      // Only allow safe fields
      const allowed = ["first_name", "last_name", "phone", "company_name", "company_role", "branche", "bio", "notes"];
      const updates: Record<string, any> = {};
      for (const key of allowed) {
        if (key in body) updates[key] = body[key];
      }
      if (Object.keys(updates).length === 0) return errorResponse("No valid fields to update");
      const { data, error } = await supabase.from("profiles").update(updates).eq("id", uuid).select().single();
      if (error) return errorResponse(error.message);
      return jsonResponse({ profile: data });
    }

    // GET /events
    if (pathParts[0] === "events" && !pathParts[1] && method === "GET") {
      const { data, error } = await supabase
        .from("events")
        .select("*, regions(name)")
        .eq("is_published", true)
        .order("event_date", { ascending: true });
      if (error) return errorResponse(error.message);
      return jsonResponse({ events: data });
    }

    // GET /events/:id
    if (pathParts[0] === "events" && pathParts[1] && method === "GET") {
      const eventId = pathParts[1];
      const { data: event, error } = await supabase
        .from("events")
        .select("*, regions(name)")
        .eq("id", eventId)
        .single();
      if (error) return errorResponse("Event not found", 404);

      const { data: agenda } = await supabase
        .from("event_agenda_items")
        .select("*")
        .eq("event_id", eventId)
        .order("sort_order");

      const { data: registrations } = await supabase
        .from("event_registrations")
        .select("id, member_id, status, registered_at")
        .eq("event_id", eventId);

      return jsonResponse({ event, agenda, registrations });
    }

    // POST /events/:id/register  body: { user_id }
    if (pathParts[0] === "events" && pathParts[1] && pathParts[2] === "register" && method === "POST") {
      const eventId = pathParts[1];
      const { user_id } = await req.json();
      if (!user_id) return errorResponse("user_id required");

      // Check not already registered
      const { data: existing } = await supabase
        .from("event_registrations")
        .select("id, status")
        .eq("event_id", eventId)
        .eq("member_id", user_id)
        .maybeSingle();

      if (existing && existing.status !== "afgemeld") {
        return errorResponse("Already registered");
      }

      if (existing && existing.status === "afgemeld") {
        const { data, error } = await supabase
          .from("event_registrations")
          .update({ status: "aangemeld", registered_at: new Date().toISOString() })
          .eq("id", existing.id)
          .select()
          .single();
        if (error) return errorResponse(error.message);
        return jsonResponse({ registration: data });
      }

      const { data, error } = await supabase
        .from("event_registrations")
        .insert({ event_id: eventId, member_id: user_id, status: "aangemeld" })
        .select()
        .single();
      if (error) return errorResponse(error.message);
      return jsonResponse({ registration: data });
    }

    // POST /events/:id/unregister  body: { user_id }
    if (pathParts[0] === "events" && pathParts[1] && pathParts[2] === "unregister" && method === "POST") {
      const eventId = pathParts[1];
      const { user_id } = await req.json();
      if (!user_id) return errorResponse("user_id required");

      const { data, error } = await supabase
        .from("event_registrations")
        .update({ status: "afgemeld" })
        .eq("event_id", eventId)
        .eq("member_id", user_id)
        .select()
        .single();
      if (error) return errorResponse(error.message || "Registration not found");
      return jsonResponse({ registration: data });
    }

    return errorResponse("Not found", 404);
  } catch (e) {
    console.error("External API error:", e);
    return errorResponse("Internal server error", 500);
  }
});
