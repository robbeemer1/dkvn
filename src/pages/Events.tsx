import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RegionBadge } from "@/components/Badges";
import { Plus, Search, Eye } from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

export default function EventsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [events, setEvents] = useState<any[]>([]);
  const [regions, setRegions] = useState<any[]>([]);
  const [regionFilter, setRegionFilter] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({
    title: "", description: "", region_id: "", event_date: "",
    start_time: "", end_time: "", location_name: "", location_address: "",
    capacity: "", price: "",
  });

  const fetchEvents = async () => {
    let query = supabase.from("events").select("*, regions(name)").order("event_date", { ascending: false });
    if (regionFilter !== "all") query = query.eq("region_id", regionFilter);
    const { data } = await query;
    setEvents(data || []);
  };

  useEffect(() => {
    supabase.from("regions").select("*").order("name").then(({ data }) => setRegions(data || []));
  }, []);
  useEffect(() => { fetchEvents(); }, [regionFilter]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.region_id) { toast.error("Kies een regio"); return; }
    const { error } = await supabase.from("events").insert({
      title: form.title,
      description: form.description || null,
      region_id: form.region_id || null,
      event_date: form.event_date,
      start_time: form.start_time || null,
      end_time: form.end_time || null,
      location_name: form.location_name || null,
      location_address: form.location_address || null,
      capacity: form.capacity ? parseInt(form.capacity) : null,
      price: form.price ? parseFloat(form.price) : null,
      created_by: user?.id,
    });
    if (error) toast.error(error.message);
    else {
      toast.success("Event aangemaakt!");
      setDialogOpen(false);
      setForm({ title: "", description: "", region_id: "", event_date: "", start_time: "", end_time: "", location_name: "", location_address: "", capacity: "", price: "" });
      fetchEvents();
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold">Events</h1>
          <p className="text-muted-foreground mt-1">{events.length} events</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button><Plus size={16} className="mr-2" />Nieuw Event</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle className="font-display">Nieuw Event</DialogTitle></DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="space-y-2">
                <Label>Titel</Label>
                <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} required />
              </div>
              <div className="space-y-2">
                <Label>Beschrijving</Label>
                <Textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Regio</Label>
                  <Select value={form.region_id} onValueChange={v => setForm(f => ({ ...f, region_id: v }))}>
                    <SelectTrigger><SelectValue placeholder="Kies regio" /></SelectTrigger>
                    <SelectContent>
                      {regions.map(r => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Datum</Label>
                  <Input type="date" value={form.event_date} onChange={e => setForm(f => ({ ...f, event_date: e.target.value }))} required />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Starttijd</Label>
                  <Input type="time" value={form.start_time} onChange={e => setForm(f => ({ ...f, start_time: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Eindtijd</Label>
                  <Input type="time" value={form.end_time} onChange={e => setForm(f => ({ ...f, end_time: e.target.value }))} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Locatie</Label>
                <Input value={form.location_name} onChange={e => setForm(f => ({ ...f, location_name: e.target.value }))} placeholder="Locatienaam" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Capaciteit</Label>
                  <Input type="number" value={form.capacity} onChange={e => setForm(f => ({ ...f, capacity: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Prijs (€)</Label>
                  <Input type="number" step="0.01" value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} />
                </div>
              </div>
              <Button type="submit" className="w-full">Event aanmaken</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex gap-3">
        <Select value={regionFilter} onValueChange={setRegionFilter}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="Alle regio's" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle regio's</SelectItem>
            {regions.map(r => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Event</TableHead>
                <TableHead>Regio</TableHead>
                <TableHead>Datum</TableHead>
                <TableHead>Locatie</TableHead>
                <TableHead>Status</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {events.map(ev => (
                <TableRow key={ev.id}>
                  <TableCell className="font-medium">{ev.title}</TableCell>
                  <TableCell>{ev.regions?.name ? <RegionBadge name={ev.regions.name} /> : "—"}</TableCell>
                  <TableCell>{new Date(ev.event_date).toLocaleDateString("nl-NL")}</TableCell>
                  <TableCell className="text-muted-foreground">{ev.location_name || "—"}</TableCell>
                  <TableCell>
                    <span className={`text-xs px-2 py-1 rounded-full ${ev.is_published ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"}`}>
                      {ev.is_published ? "Gepubliceerd" : "Concept"}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="sm" onClick={() => navigate(`/events/${ev.id}`)}>
                      <Eye size={16} />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {events.length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Geen events gevonden</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
