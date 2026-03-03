import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, Calendar, Armchair, TrendingUp } from "lucide-react";

export default function Dashboard() {
  const { profile, roles } = useAuth();
  const [stats, setStats] = useState({ members: 0, events: 0, upcomingEvents: 0, totalMeetings: 0 });
  const [recentEvents, setRecentEvents] = useState<any[]>([]);

  useEffect(() => {
    const fetchStats = async () => {
      const [members, events, upcoming, meetings, recent] = await Promise.all([
        supabase.from("profiles").select("id", { count: "exact", head: true }),
        supabase.from("events").select("id", { count: "exact", head: true }),
        supabase.from("events").select("id", { count: "exact", head: true }).gte("event_date", new Date().toISOString().split("T")[0]),
        supabase.from("meeting_history").select("id", { count: "exact", head: true }),
        supabase.from("events").select("*, regions(name)").order("event_date", { ascending: false }).limit(5),
      ]);
      setStats({
        members: members.count || 0,
        events: events.count || 0,
        upcomingEvents: upcoming.count || 0,
        totalMeetings: meetings.count || 0,
      });
      setRecentEvents(recent.data || []);
    };
    fetchStats();
  }, []);

  const statCards = [
    { label: "Leden", value: stats.members, icon: Users, color: "text-primary" },
    { label: "Events", value: stats.events, icon: Calendar, color: "text-info" },
    { label: "Komende events", value: stats.upcomingEvents, icon: Calendar, color: "text-success" },
    { label: "Ontmoetingen", value: stats.totalMeetings, icon: TrendingUp, color: "text-gold" },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-display font-bold">
          Welkom{profile?.first_name ? `, ${profile.first_name}` : ""}
        </h1>
        <p className="text-muted-foreground mt-1">Overzicht van De Kunst van Netwerken</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map(stat => (
          <Card key={stat.label}>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{stat.label}</p>
                  <p className="text-3xl font-bold mt-1">{stat.value}</p>
                </div>
                <stat.icon className={`${stat.color} opacity-80`} size={32} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-display">Recente Events</CardTitle>
        </CardHeader>
        <CardContent>
          {recentEvents.length === 0 ? (
            <p className="text-muted-foreground text-sm">Nog geen events aangemaakt.</p>
          ) : (
            <div className="space-y-3">
              {recentEvents.map(event => (
                <div key={event.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                  <div>
                    <p className="font-medium">{event.title}</p>
                    <p className="text-sm text-muted-foreground">
                      {event.regions?.name} · {new Date(event.event_date).toLocaleDateString("nl-NL")}
                    </p>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full ${event.is_published ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"}`}>
                    {event.is_published ? "Gepubliceerd" : "Concept"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
