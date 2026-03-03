import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";

export default function SeatingPage() {
  const [events, setEvents] = useState<any[]>([]);
  const [selectedEvent, setSelectedEvent] = useState("");
  const [rounds, setRounds] = useState<any[]>([]);
  const [versions, setVersions] = useState<any[]>([]);
  const [aiInsight, setAiInsight] = useState("");
  const [loadingAi, setLoadingAi] = useState(false);

  useEffect(() => {
    supabase.from("events").select("id, title, event_date, regions(name)").order("event_date", { ascending: false }).then(({ data }) => setEvents(data || []));
  }, []);

  useEffect(() => {
    if (!selectedEvent) { setRounds([]); setVersions([]); return; }
    Promise.all([
      supabase.from("event_rounds").select("*, event_tables(*, table_seats(*, profiles:member_id(first_name, last_name)))").eq("event_id", selectedEvent).order("round_number"),
      supabase.from("seating_versions").select("*").eq("event_id", selectedEvent).order("version_number", { ascending: false }),
    ]).then(([r, v]) => {
      setRounds(r.data || []);
      setVersions(v.data || []);
    });
  }, [selectedEvent]);

  const askAi = async () => {
    if (!selectedEvent) return;
    setLoadingAi(true);
    try {
      const res = await supabase.functions.invoke("seating-ai-assistant", { body: { event_id: selectedEvent, question: "Analyseer de huidige tafelindeling en geef suggesties voor verbetering." } });
      if (res.error) throw res.error;
      setAiInsight(res.data?.answer || "Geen analyse beschikbaar.");
    } catch (err: any) {
      toast.error(err.message || "AI-fout");
    }
    setLoadingAi(false);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-display font-bold">Tafelindeling</h1>
        <p className="text-muted-foreground mt-1">Overzicht en optimalisatie van tafelindelingen</p>
      </div>

      <div className="flex gap-3 items-end">
        <div className="flex-1 max-w-sm">
          <Select value={selectedEvent} onValueChange={setSelectedEvent}>
            <SelectTrigger><SelectValue placeholder="Selecteer een event" /></SelectTrigger>
            <SelectContent>
              {events.map(ev => (
                <SelectItem key={ev.id} value={ev.id}>
                  {ev.title} — {ev.regions?.name} ({new Date(ev.event_date).toLocaleDateString("nl-NL")})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {selectedEvent && (
          <Button variant="outline" onClick={askAi} disabled={loadingAi}>
            <Sparkles size={14} className="mr-1" />{loadingAi ? "Analyseren..." : "AI Analyse"}
          </Button>
        )}
      </div>

      {aiInsight && (
        <Card className="border-primary/30 bg-accent/30">
          <CardHeader><CardTitle className="text-sm font-semibold flex items-center gap-2"><Sparkles size={16} className="text-primary" />AI Analyse</CardTitle></CardHeader>
          <CardContent><p className="text-sm whitespace-pre-wrap">{aiInsight}</p></CardContent>
        </Card>
      )}

      {selectedEvent && rounds.length === 0 && (
        <Card><CardContent className="py-8 text-center text-muted-foreground">Geen rondes gevonden. Ga naar het event om rondes en indelingen aan te maken.</CardContent></Card>
      )}

      {rounds.map(round => (
        <Card key={round.id}>
          <CardHeader><CardTitle className="text-lg font-display">{round.name || `Ronde ${round.round_number}`}</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {(round.event_tables || []).map((table: any) => (
                <div key={table.id} className="border rounded-lg p-4 bg-muted/30">
                  <h4 className="font-semibold text-sm mb-2">{table.table_name || `Tafel ${table.table_number}`} <span className="text-muted-foreground font-normal">({table.table_seats?.length || 0}/{table.capacity})</span></h4>
                  <ul className="space-y-1 text-sm">
                    {(table.table_seats || []).map((seat: any) => (
                      <li key={seat.id} className="text-muted-foreground">
                        • {seat.profiles ? `${seat.profiles.first_name} ${seat.profiles.last_name}` : "Gast"}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
