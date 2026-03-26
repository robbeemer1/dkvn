import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { MembershipBadge, StatusBadge, RegionBadge } from "@/components/Badges";
import { ArrowLeft, Plus, UserPlus, Sparkles, CalendarIcon, Save, Pencil, Trash2, RotateCcw, X, Printer, FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { nl } from "date-fns/locale";
import { cn } from "@/lib/utils";
import EventAgenda from "@/components/EventAgenda";
import EventTodos from "@/components/EventTodos";
import PasteAttendees from "@/components/PasteAttendees";
import SearchableSelect from "@/components/SearchableSelect";
import ConfirmDialog from "@/components/ConfirmDialog";
import { printAttendeesPdf, printSeatingPdf } from "@/lib/printPdf";
import { exportAttendeesExcel, exportSeatingExcel } from "@/lib/exportExcel";
import SeatingVersions from "@/components/SeatingVersions";

export default function EventDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [event, setEvent] = useState<any>(null);
  const [registrations, setRegistrations] = useState<any[]>([]);
  const [guests, setGuests] = useState<any[]>([]);
  const [rounds, setRounds] = useState<any[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [regions, setRegions] = useState<any[]>([]);
  const [addMemberDialog, setAddMemberDialog] = useState(false);
  const [addGuestDialog, setAddGuestDialog] = useState(false);
  const [selectedMember, setSelectedMember] = useState("");
  const [guestForm, setGuestForm] = useState({ first_name: "", last_name: "", email: "", company_name: "" });
  const [memberSearch, setMemberSearch] = useState("");
  const [attendeeSearch, setAttendeeSearch] = useState("");
  const [seatingVersions, setSeatingVersions] = useState<any[]>([]);
  const [configRoundId, setConfigRoundId] = useState<string | null>(null);
  const [tableConfig, setTableConfig] = useState<{ count: number; hosts: Record<number, string>; fixedMembers: Record<number, string[]> }>({ count: 0, hosts: {}, fixedMembers: {} });
  const [confirmAction, setConfirmAction] = useState<{ title: string; description: string; onConfirm: () => void } | null>(null);

  // Edit state
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<any>({});

  const fetchAll = async () => {
    if (!id) return;
    const [ev, regs, gs, rnds, vers, allProfiles, regs2] = await Promise.all([
      supabase.from("events").select("*, regions(name)").eq("id", id).single(),
      supabase.from("event_registrations").select("*").eq("event_id", id),
      supabase.from("event_guests").select("*").eq("event_id", id),
      supabase.from("event_rounds").select("*, event_tables(*, table_seats(*))").eq("event_id", id).order("round_number"),
      supabase.from("seating_versions").select("*").eq("event_id", id).order("version_number", { ascending: false }),
      supabase.from("profiles").select("id, first_name, last_name, company_name, membership_level, regions(name)"),
      supabase.from("regions").select("id, name").order("name"),
    ]);
    setEvent(ev.data);
    setRegions(regs2.data || []);

    const profileMap: Record<string, any> = {};
    for (const p of allProfiles.data || []) {
      profileMap[p.id] = p;
    }

    const enrichedRegs = (regs.data || []).map((r: any) => ({
      ...r,
      profiles: profileMap[r.member_id] || null,
    }));
    setRegistrations(enrichedRegs);
    setGuests(gs.data || []);

    const enrichedRounds = (rnds.data || []).map((round: any) => ({
      ...round,
      event_tables: (round.event_tables || [])
        .sort((a: any, b: any) => (a.table_number || 0) - (b.table_number || 0))
        .map((table: any) => ({
          ...table,
          table_seats: (table.table_seats || []).map((seat: any) => ({
            ...seat,
            profiles: seat.member_id ? profileMap[seat.member_id] || null : null,
          })),
        })),
    }));
    setRounds(enrichedRounds);
    setSeatingVersions(vers.data || []);
  };

  useEffect(() => { fetchAll(); }, [id]);

  useEffect(() => {
    supabase.from("profiles").select("id, first_name, last_name, company_name").order("last_name").then(({ data }) => setMembers(data || []));
  }, []);

  const startEditing = () => {
    setEditForm({
      title: event.title || "",
      description: event.description || "",
      event_date: event.event_date || "",
      start_time: event.start_time || "",
      end_time: event.end_time || "",
      location_name: event.location_name || "",
      location_address: event.location_address || "",
      capacity: event.capacity ?? "",
      price: event.price ?? "",
      region_id: event.region_id || "",
      is_published: event.is_published || false,
    });
    setEditing(true);
  };

  const saveEvent = async () => {
    if (!id) return;
    const updates: any = {
      title: editForm.title,
      description: editForm.description || null,
      event_date: editForm.event_date,
      start_time: editForm.start_time || null,
      end_time: editForm.end_time || null,
      location_name: editForm.location_name || null,
      location_address: editForm.location_address || null,
      capacity: editForm.capacity ? Number(editForm.capacity) : null,
      price: editForm.price ? Number(editForm.price) : null,
      region_id: editForm.region_id,
      is_published: editForm.is_published,
    };
    const { error } = await supabase.from("events").update(updates).eq("id", id);
    if (error) toast.error(error.message);
    else {
      toast.success("Event bijgewerkt");
      setEditing(false);
      fetchAll();
    }
  };

  const addRegistration = async () => {
    if (!selectedMember || !id) return;
    const res = await supabase.functions.invoke("bulk-add-attendees", {
      body: { event_id: id, matched_ids: [selectedMember], guests: [] },
    });
    if (res.error || res.data?.error) toast.error(res.error?.message || res.data?.error || "Fout bij toevoegen");
    else { toast.success("Lid toegevoegd"); setAddMemberDialog(false); setSelectedMember(""); setMemberSearch(""); fetchAll(); }
  };

  const addGuest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id) return;
    const { error } = await supabase.from("event_guests").insert({ ...guestForm, event_id: id, invited_by: user?.id });
    if (error) toast.error(error.message);
    else { toast.success("Gast toegevoegd"); setAddGuestDialog(false); setGuestForm({ first_name: "", last_name: "", email: "", company_name: "" }); fetchAll(); }
  };

  const updateStatus = async (regId: string, status: string) => {
    const { error } = await supabase.from("event_registrations").update({ status: status as any }).eq("id", regId);
    if (error) toast.error(error.message);
    else fetchAll();
  };

  const addRound = async () => {
    if (!id) return;
    const nextNum = (rounds.length > 0 ? Math.max(...rounds.map(r => r.round_number)) : 0) + 1;
    const { error } = await supabase.from("event_rounds").insert({ event_id: id, round_number: nextNum, name: `Ronde ${nextNum}` });
    if (error) toast.error(error.message);
    else { toast.success(`Ronde ${nextNum} toegevoegd`); fetchAll(); }
  };

  const deleteRegistration = async (regId: string) => {
    const { error } = await supabase.from("event_registrations").delete().eq("id", regId);
    if (error) toast.error(error.message);
    else fetchAll();
  };

  const deleteGuest = async (guestId: string) => {
    const { error } = await supabase.from("event_guests").delete().eq("id", guestId);
    if (error) toast.error(error.message);
    else fetchAll();
  };

  const resetRound = async (roundId: string) => {
    // Delete all seats for all tables in this round, then delete the tables
    const { data: tables } = await supabase.from("event_tables").select("id").eq("round_id", roundId);
    if (tables && tables.length > 0) {
      const tableIds = tables.map(t => t.id);
      await supabase.from("table_seats").delete().in("table_id", tableIds);
      await supabase.from("event_tables").delete().eq("round_id", roundId);
    }
    toast.success("Ronde gereset — tafels en stoelen verwijderd");
    fetchAll();
  };

  const deleteRound = async (roundId: string) => {
    // Delete seats → tables → round
    const { data: tables } = await supabase.from("event_tables").select("id").eq("round_id", roundId);
    if (tables && tables.length > 0) {
      const tableIds = tables.map(t => t.id);
      await supabase.from("table_seats").delete().in("table_id", tableIds);
      await supabase.from("event_tables").delete().eq("round_id", roundId);
    }
    const { error } = await supabase.from("event_rounds").delete().eq("id", roundId);
    if (error) toast.error(error.message);
    else { toast.success("Ronde verwijderd"); fetchAll(); }
  };

  const removeSeat = async (seatId: string) => {
    const { error } = await supabase.from("table_seats").delete().eq("id", seatId);
    if (error) toast.error(error.message);
    else fetchAll();
  };

  const addSeatToTable = async (tableId: string, memberId: string) => {
    // Find highest seat number in that table
    const { data: existing } = await supabase.from("table_seats").select("seat_number").eq("table_id", tableId).order("seat_number", { ascending: false }).limit(1);
    const nextSeat = ((existing?.[0]?.seat_number) || 0) + 1;
    const { error } = await supabase.from("table_seats").insert({ table_id: tableId, member_id: memberId, seat_number: nextSeat });
    if (error) toast.error(error.message);
    else fetchAll();
  };

  const generateSeating = async (roundId: string) => {
    if (!id) return;
    toast.info("Tafelindeling wordt gegenereerd...");
    try {
      const body: any = { event_id: id, round_id: roundId };
      if (tableConfig.count > 0) body.num_tables = tableConfig.count;
      if (Object.keys(tableConfig.hosts).length > 0) body.table_hosts = tableConfig.hosts;
      if (Object.keys(tableConfig.fixedMembers).length > 0) body.table_fixed_members = tableConfig.fixedMembers;
      const res = await supabase.functions.invoke("generate-seating", { body });
      if (res.error) {
        toast.error(res.error?.message || "Fout bij genereren");
        return;
      }
      const data = res.data;
      if (data?.error) {
        toast.error(data.error);
        return;
      }
      toast.success(data?.message || "Tafelindeling gegenereerd!");
      fetchAll();
    } catch (err: any) {
      toast.error(err.message || "Fout bij genereren");
    }
  };

  if (!event) return <div className="p-8 text-muted-foreground">Laden...</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <Button variant="ghost" size="sm" className="hidden sm:inline-flex" onClick={() => navigate("/events")}><ArrowLeft size={16} /></Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl sm:text-3xl font-display font-bold truncate">{event.title}</h1>
          <p className="text-muted-foreground text-sm sm:text-base">
            {event.regions?.name} · {new Date(event.event_date).toLocaleDateString("nl-NL")}
            {event.location_name ? ` · ${event.location_name}` : ""}
          </p>
        </div>
      </div>

      <Tabs defaultValue="details">
        <TabsList className="w-full overflow-x-auto flex justify-start">
          <TabsTrigger value="details">Details</TabsTrigger>
          <TabsTrigger value="agenda">Agenda</TabsTrigger>
          <TabsTrigger value="todos">To-do</TabsTrigger>
          <TabsTrigger value="attendees">Deelnemers ({registrations.length + guests.length})</TabsTrigger>
          <TabsTrigger value="seating">Tafelindeling ({rounds.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="details" className="space-y-4">
          <div className="flex justify-end">
            {!editing ? (
              <Button size="sm" variant="outline" onClick={startEditing}><Pencil size={14} className="mr-1" />Bewerken</Button>
            ) : (
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Annuleren</Button>
                <Button size="sm" onClick={saveEvent}><Save size={14} className="mr-1" />Opslaan</Button>
              </div>
            )}
          </div>

          {!editing ? (
            <Card>
              <CardContent className="pt-6 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-3">
                    <div>
                      <p className="text-xs text-muted-foreground">Titel</p>
                      <p className="font-medium">{event.title}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Datum</p>
                      <p className="font-medium">{new Date(event.event_date).toLocaleDateString("nl-NL", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Tijd</p>
                      <p className="font-medium">
                        {event.start_time ? event.start_time.slice(0, 5) : "—"}
                        {event.end_time ? ` – ${event.end_time.slice(0, 5)}` : ""}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Regio</p>
                      <p className="font-medium">{event.regions?.name || "—"}</p>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <div>
                      <p className="text-xs text-muted-foreground">Locatie</p>
                      <p className="font-medium">{event.location_name || "—"}</p>
                      {event.location_address && <p className="text-sm text-muted-foreground">{event.location_address}</p>}
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Capaciteit</p>
                      <p className="font-medium">{event.capacity ?? "—"}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Prijs</p>
                      <p className="font-medium">{event.price != null ? `€ ${Number(event.price).toFixed(2)}` : "Gratis"}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Status</p>
                      <p className={cn("font-medium", event.is_published ? "text-green-600" : "text-muted-foreground")}>
                        {event.is_published ? "Gepubliceerd" : "Concept"}
                      </p>
                    </div>
                  </div>
                </div>
                {event.description && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Omschrijving</p>
                    <p className="text-sm whitespace-pre-wrap">{event.description}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="pt-6 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Titel</Label>
                    <Input value={editForm.title} onChange={e => setEditForm((f: any) => ({ ...f, title: e.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label>Regio</Label>
                    <Select value={editForm.region_id} onValueChange={v => setEditForm((f: any) => ({ ...f, region_id: v }))}>
                      <SelectTrigger><SelectValue placeholder="Kies regio" /></SelectTrigger>
                      <SelectContent>
                        {regions.map(r => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Datum</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !editForm.event_date && "text-muted-foreground")}>
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {editForm.event_date ? format(new Date(editForm.event_date), "d MMMM yyyy", { locale: nl }) : "Kies datum"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={editForm.event_date ? new Date(editForm.event_date) : undefined}
                          onSelect={d => d && setEditForm((f: any) => ({ ...f, event_date: format(d, "yyyy-MM-dd") }))}
                          initialFocus
                          className="p-3 pointer-events-auto"
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-2">
                      <Label>Starttijd</Label>
                      <Input type="time" value={editForm.start_time} onChange={e => setEditForm((f: any) => ({ ...f, start_time: e.target.value }))} />
                    </div>
                    <div className="space-y-2">
                      <Label>Eindtijd</Label>
                      <Input type="time" value={editForm.end_time} onChange={e => setEditForm((f: any) => ({ ...f, end_time: e.target.value }))} />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Locatienaam</Label>
                    <Input value={editForm.location_name} onChange={e => setEditForm((f: any) => ({ ...f, location_name: e.target.value }))} placeholder="Bijv. Hotel Krasnapolsky" />
                  </div>
                  <div className="space-y-2">
                    <Label>Adres</Label>
                    <Input value={editForm.location_address} onChange={e => setEditForm((f: any) => ({ ...f, location_address: e.target.value }))} placeholder="Straat, stad" />
                  </div>
                  <div className="space-y-2">
                    <Label>Capaciteit</Label>
                    <Input type="number" value={editForm.capacity} onChange={e => setEditForm((f: any) => ({ ...f, capacity: e.target.value }))} placeholder="Max deelnemers" />
                  </div>
                  <div className="space-y-2">
                    <Label>Prijs (€)</Label>
                    <Input type="number" step="0.01" value={editForm.price} onChange={e => setEditForm((f: any) => ({ ...f, price: e.target.value }))} placeholder="0.00" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Omschrijving</Label>
                  <Textarea value={editForm.description} onChange={e => setEditForm((f: any) => ({ ...f, description: e.target.value }))} rows={4} placeholder="Beschrijf het event..." />
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="is_published"
                    checked={editForm.is_published}
                    onChange={e => setEditForm((f: any) => ({ ...f, is_published: e.target.checked }))}
                    className="rounded border-input"
                  />
                  <Label htmlFor="is_published">Gepubliceerd</Label>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="agenda">
          <EventAgenda eventId={id!} />
        </TabsContent>

        <TabsContent value="todos">
          <EventTodos eventId={id!} />
        </TabsContent>

        <TabsContent value="attendees" className="space-y-4">
          <div className="flex gap-2 flex-wrap">
            <Dialog open={addMemberDialog} onOpenChange={setAddMemberDialog}>
              <DialogTrigger asChild><Button size="sm"><UserPlus size={14} className="mr-1" />Lid toevoegen</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Lid toevoegen aan event</DialogTitle></DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Zoek lid</Label>
                    <Input value={memberSearch} onChange={e => setMemberSearch(e.target.value)} placeholder="Zoek op naam of bedrijf" />
                  </div>
                  <Select value={selectedMember} onValueChange={setSelectedMember}>
                    <SelectTrigger><SelectValue placeholder="Kies een lid" /></SelectTrigger>
                    <SelectContent>
                      {members
                        .filter(m => !registrations.some(r => r.member_id === m.id))
                        .filter(m => `${m.first_name} ${m.last_name} ${m.company_name || ""}`.toLowerCase().includes(memberSearch.toLowerCase().trim()))
                        .map(m => (
                          <SelectItem key={m.id} value={m.id}>{m.first_name} {m.last_name} {m.company_name ? `(${m.company_name})` : ""}</SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                  <Button onClick={addRegistration} className="w-full">Toevoegen</Button>
                </div>
              </DialogContent>
            </Dialog>
            <PasteAttendees eventId={id!} existingMemberIds={registrations.map(r => r.member_id)} onDone={fetchAll} />
            <Dialog open={addGuestDialog} onOpenChange={setAddGuestDialog}>
              <DialogTrigger asChild><Button size="sm" variant="outline"><Plus size={14} className="mr-1" />Gast toevoegen</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Gast toevoegen</DialogTitle></DialogHeader>
                <form onSubmit={addGuest} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2"><Label>Voornaam</Label><Input value={guestForm.first_name} onChange={e => setGuestForm(f => ({ ...f, first_name: e.target.value }))} required /></div>
                    <div className="space-y-2"><Label>Achternaam</Label><Input value={guestForm.last_name} onChange={e => setGuestForm(f => ({ ...f, last_name: e.target.value }))} required /></div>
                  </div>
                  <div className="space-y-2"><Label>E-mail</Label><Input type="email" value={guestForm.email} onChange={e => setGuestForm(f => ({ ...f, email: e.target.value }))} /></div>
                  <div className="space-y-2"><Label>Bedrijf</Label><Input value={guestForm.company_name} onChange={e => setGuestForm(f => ({ ...f, company_name: e.target.value }))} /></div>
                  <Button type="submit" className="w-full">Gast toevoegen</Button>
                </form>
              </DialogContent>
            </Dialog>
            <Button size="sm" variant="outline" onClick={() => {
              const eventInfo = `${event.regions?.name || ""} · ${new Date(event.event_date).toLocaleDateString("nl-NL", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}${event.location_name ? ` · ${event.location_name}` : ""}`;
              printAttendeesPdf(event.title, eventInfo, registrations, guests);
            }}>
              <Printer size={14} className="mr-1" />PDF
            </Button>
          </div>

          <div className="relative max-w-sm">
            <Input
              value={attendeeSearch}
              onChange={e => setAttendeeSearch(e.target.value)}
              placeholder="Zoek deelnemers..."
              className="h-9"
            />
          </div>

          <Card>
            <CardHeader><CardTitle className="text-sm font-semibold">Leden ({registrations.length})</CardTitle></CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Naam</TableHead>
                    <TableHead>Bedrijf</TableHead>
                    <TableHead>Niveau</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Acties</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {registrations
                    .filter(r => {
                      if (!attendeeSearch.trim()) return true;
                      const q = attendeeSearch.toLowerCase();
                      return `${r.profiles?.first_name} ${r.profiles?.last_name} ${r.profiles?.company_name || ""}`.toLowerCase().includes(q);
                    })
                    .map(r => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.profiles?.first_name} {r.profiles?.last_name}</TableCell>
                      <TableCell className="text-muted-foreground">{r.profiles?.company_name || "—"}</TableCell>
                      <TableCell>{r.profiles?.membership_level && <MembershipBadge level={r.profiles.membership_level} />}</TableCell>
                      <TableCell><StatusBadge status={r.status} /></TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Select value={r.status} onValueChange={v => updateStatus(r.id, v)}>
                            <SelectTrigger className="w-[120px] h-8 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {["aangemeld","bevestigd","aanwezig","afgemeld","no_show"].map(s => (
                                <SelectItem key={s} value={s} className="text-xs capitalize">{s.replace("_"," ")}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={() => setConfirmAction({
                              title: "Deelnemer verwijderen",
                              description: `Weet je zeker dat je ${r.profiles?.first_name} ${r.profiles?.last_name} wilt verwijderen uit dit event?`,
                              onConfirm: () => deleteRegistration(r.id),
                            })}
                          >
                            <Trash2 size={14} />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {guests.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-sm font-semibold">Gasten ({guests.length})</CardTitle></CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader><TableRow><TableHead>Naam</TableHead><TableHead>Bedrijf</TableHead><TableHead>E-mail</TableHead><TableHead>Status</TableHead><TableHead></TableHead></TableRow></TableHeader>
                  <TableBody>
                    {guests
                      .filter(g => {
                        if (!attendeeSearch.trim()) return true;
                        const q = attendeeSearch.toLowerCase();
                        return `${g.first_name} ${g.last_name} ${g.company_name || ""} ${g.email || ""}`.toLowerCase().includes(q);
                      })
                      .map(g => (
                      <TableRow key={g.id}>
                        <TableCell className="font-medium">{g.first_name} {g.last_name}</TableCell>
                        <TableCell className="text-muted-foreground">{g.company_name || "—"}</TableCell>
                        <TableCell className="text-muted-foreground">{g.email || "—"}</TableCell>
                        <TableCell><StatusBadge status={g.status} /></TableCell>
                        <TableCell>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={() => setConfirmAction({
                              title: "Gast verwijderen",
                              description: `Weet je zeker dat je ${g.first_name} ${g.last_name} wilt verwijderen uit dit event?`,
                              onConfirm: () => deleteGuest(g.id),
                            })}
                          >
                            <Trash2 size={14} />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="seating" className="space-y-4">
           <div className="flex gap-2">
            <Button size="sm" onClick={addRound}><Plus size={14} className="mr-1" />Ronde toevoegen</Button>
            {rounds.length > 0 && (
              <Button size="sm" variant="outline" onClick={() => {
                const eventInfo = `${event.regions?.name || ""} · ${new Date(event.event_date).toLocaleDateString("nl-NL", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}${event.location_name ? ` · ${event.location_name}` : ""}`;
                printSeatingPdf(event.title, eventInfo, rounds);
              }}>
                <Printer size={14} className="mr-1" />PDF
              </Button>
            )}
          </div>

          {/* Table configuration dialog */}
          <Dialog open={configRoundId !== null} onOpenChange={open => { if (!open) setConfigRoundId(null); }}>
            <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
              <DialogHeader><DialogTitle className="font-display">Tafelindeling configureren — {rounds.find(r => r.id === configRoundId)?.name || "Ronde"}</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Aantal tafels</Label>
                  <Input
                    type="number"
                    min={1}
                    max={50}
                    value={tableConfig.count}
                    onChange={e => {
                      const count = Math.max(1, parseInt(e.target.value) || 1);
                      setTableConfig(prev => {
                        const hosts: Record<number, string> = {};
                        const fixedMembers: Record<number, string[]> = {};
                        for (let i = 1; i <= count; i++) {
                          if (prev.hosts[i]) hosts[i] = prev.hosts[i];
                          if (prev.fixedMembers[i]) fixedMembers[i] = prev.fixedMembers[i];
                        }
                        return { count, hosts, fixedMembers };
                      });
                    }}
                  />
                  <p className="text-xs text-muted-foreground">
                    {registrations.filter(r => ["aangemeld", "bevestigd", "aanwezig"].includes(r.status)).length} actieve deelnemers
                    → ca. {tableConfig.count > 0 ? Math.ceil(registrations.filter(r => ["aangemeld", "bevestigd", "aanwezig"].includes(r.status)).length / tableConfig.count) : 0} per tafel
                  </p>
                </div>

                <div className="space-y-5">
                  <Label>Tafels configureren</Label>
                  {Array.from({ length: tableConfig.count }, (_, i) => i + 1).map(tableNum => {
                    const activeRegs = registrations.filter(r => ["aangemeld", "bevestigd", "aanwezig"].includes(r.status));
                    // All pre-assigned member ids across other tables
                    const allAssignedOtherTables = new Set<string>();
                    for (const [num, hostId] of Object.entries(tableConfig.hosts)) {
                      if (Number(num) !== tableNum) allAssignedOtherTables.add(hostId);
                    }
                    for (const [num, members] of Object.entries(tableConfig.fixedMembers)) {
                      if (Number(num) !== tableNum) members.forEach(m => allAssignedOtherTables.add(m));
                    }
                    const currentHost = tableConfig.hosts[tableNum] || "";
                    const currentFixed = tableConfig.fixedMembers[tableNum] || [];
                    // Available for host: not assigned to other tables
                    const availableForHost = activeRegs.filter(r => !allAssignedOtherTables.has(r.member_id));
                    // Available for fixed members: not assigned to other tables, not the host of this table
                    const availableForFixed = activeRegs.filter(r =>
                      !allAssignedOtherTables.has(r.member_id) && r.member_id !== currentHost
                    );

                    return (
                      <div key={tableNum} className="border rounded-lg p-3 space-y-2 bg-muted/20">
                        <span className="text-sm font-semibold">Tafel {tableNum}</span>
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Voorzitter</Label>
                          <SearchableSelect
                            value={currentHost || "none"}
                            onValueChange={v => setTableConfig(prev => {
                              const hosts = { ...prev.hosts };
                              if (v === "none" || v === "") delete hosts[tableNum];
                              else hosts[tableNum] = v;
                              const fixedMembers = { ...prev.fixedMembers };
                              if (v !== "none" && v !== "" && fixedMembers[tableNum]) {
                                fixedMembers[tableNum] = fixedMembers[tableNum].filter(m => m !== v);
                              }
                              return { ...prev, hosts, fixedMembers };
                            })}
                            placeholder="Geen voorzitter"
                            emptyText="Geen leden gevonden."
                            options={[
                              { value: "none", label: "Geen voorzitter" },
                              ...availableForHost.map(r => ({
                                value: r.member_id,
                                label: `${r.profiles?.first_name} ${r.profiles?.last_name}${r.profiles?.company_name ? ` (${r.profiles.company_name})` : ""}`,
                              })),
                            ]}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Vaste deelnemers</Label>
                          <SearchableSelect
                            value=""
                            onValueChange={v => {
                              if (!v) return;
                              setTableConfig(prev => {
                                const fixedMembers = { ...prev.fixedMembers };
                                const current = fixedMembers[tableNum] || [];
                                if (!current.includes(v)) fixedMembers[tableNum] = [...current, v];
                                return { ...prev, fixedMembers };
                              });
                            }}
                            placeholder="Deelnemer toevoegen..."
                            emptyText="Geen leden gevonden."
                            options={availableForFixed.filter(r => !currentFixed.includes(r.member_id)).map(r => ({
                              value: r.member_id,
                              label: `${r.profiles?.first_name} ${r.profiles?.last_name}${r.profiles?.company_name ? ` (${r.profiles.company_name})` : ""}`,
                            }))}
                          />
                          {currentFixed.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {currentFixed.map(memberId => {
                                const reg = activeRegs.find(r => r.member_id === memberId);
                                return (
                                  <span key={memberId} className="inline-flex items-center gap-1 text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                                    {reg?.profiles?.first_name} {reg?.profiles?.last_name}
                                    <button
                                      type="button"
                                      className="hover:text-destructive"
                                      onClick={() => setTableConfig(prev => {
                                        const fixedMembers = { ...prev.fixedMembers };
                                        fixedMembers[tableNum] = (fixedMembers[tableNum] || []).filter(m => m !== memberId);
                                        return { ...prev, fixedMembers };
                                      })}
                                    >×</button>
                                  </span>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <Button className="w-full" onClick={() => {
                  const rid = configRoundId;
                  setConfigRoundId(null);
                  if (rid) generateSeating(rid);
                }}>
                  <Sparkles size={14} className="mr-2" />Indeling genereren
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          {rounds.length === 0 ? (
            <Card><CardContent className="py-8 text-center text-muted-foreground">Nog geen rondes aangemaakt. Voeg rondes toe om tafelindelingen te genereren.</CardContent></Card>
          ) : (
            rounds.map(round => (
              <Card key={round.id}>
                <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <CardTitle className="text-lg font-display">{round.name || `Ronde ${round.round_number}`}</CardTitle>
                  <div className="flex gap-1 flex-wrap">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 px-2 text-xs"
                      onClick={() => {
                        const activeAttendees = registrations.filter(r => ["aangemeld", "bevestigd", "aanwezig"].includes(r.status));
                        if (activeAttendees.length === 0) { toast.error("Voeg eerst deelnemers toe"); return; }
                        setTableConfig({ count: Math.max(1, Math.ceil(activeAttendees.length / 8)), hosts: {}, fixedMembers: {} });
                        setConfigRoundId(round.id);
                      }}
                    >
                      <Sparkles size={13} className="mr-1" />Genereer
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                      onClick={() => setConfirmAction({
                        title: "Ronde resetten",
                        description: `Weet je zeker dat je alle tafels en stoelen van "${round.name || `Ronde ${round.round_number}`}" wilt resetten?`,
                        onConfirm: () => resetRound(round.id),
                      })}
                    >
                      <RotateCcw size={13} className="mr-1" />Reset
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={() => setConfirmAction({
                        title: "Ronde verwijderen",
                        description: `Weet je zeker dat je "${round.name || `Ronde ${round.round_number}`}" volledig wilt verwijderen?`,
                        onConfirm: () => deleteRound(round.id),
                      })}
                    >
                      <Trash2 size={13} className="mr-1" />Verwijderen
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {round.event_tables?.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {round.event_tables.map((table: any) => (
                        <div key={table.id} className="border rounded-lg p-4 bg-muted/30">
                          <h4 className="font-semibold text-sm mb-2">
                            {table.table_name || `Tafel ${table.table_number}`}
                            <span className="text-muted-foreground font-normal ml-1">({table.table_seats?.length || 0}/{table.capacity})</span>
                            {table.host_member_id && (
                              <span className="ml-2 text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded">Voorzitter</span>
                            )}
                          </h4>
                          {table.table_seats?.length > 0 ? (
                            <ul className="space-y-1 text-sm">
                              {table.table_seats
                                .sort((a: any, b: any) => (a.seat_number || 0) - (b.seat_number || 0))
                                .map((seat: any) => (
                                <li key={seat.id} className={cn("flex items-center justify-between group", seat.member_id === table.host_member_id ? "text-foreground font-semibold" : "text-muted-foreground")}>
                                  <span>
                                    • {seat.profiles ? `${seat.profiles.first_name} ${seat.profiles.last_name}`.trim() : `Stoel ${seat.seat_number || '?'}`}
                                    {seat.member_id === table.host_member_id && " ★"}
                                  </span>
                                  <button
                                    type="button"
                                    className="opacity-0 group-hover:opacity-100 text-destructive hover:text-destructive/80 transition-opacity p-0.5"
                                    title="Verwijder van tafel"
                                    onClick={() => removeSeat(seat.id)}
                                  >
                                    <X size={12} />
                                  </button>
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p className="text-xs text-muted-foreground">Nog geen stoelen toegewezen</p>
                          )}
                          {/* Add member if space available */}
                          {(table.table_seats?.length || 0) < table.capacity && (() => {
                            const seatedInRound = new Set<string>();
                            for (const t of round.event_tables || []) {
                              for (const s of t.table_seats || []) {
                                if (s.member_id) seatedInRound.add(s.member_id);
                              }
                            }
                            const available = registrations
                              .filter((r: any) => ["aangemeld", "bevestigd", "aanwezig"].includes(r.status) && !seatedInRound.has(r.member_id))
                              .map((r: any) => ({
                                value: r.member_id,
                                label: `${r.profiles?.first_name} ${r.profiles?.last_name}${r.profiles?.company_name ? ` (${r.profiles.company_name})` : ""}`,
                              }));
                            return available.length > 0 ? (
                              <div className="mt-2">
                                <SearchableSelect
                                  value=""
                                  onValueChange={v => { if (v) addSeatToTable(table.id, v); }}
                                  placeholder="+ Deelnemer toevoegen"
                                  emptyText="Iedereen is al geplaatst."
                                  options={available}
                                  triggerClassName="h-7 text-xs border-dashed"
                                />
                              </div>
                            ) : null;
                          })()}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">Geen tafels in deze ronde. Genereer een indeling.</p>
                  )}
                </CardContent>
              </Card>
            ))
          )}

          <SeatingVersions
            eventId={id!}
            rounds={rounds}
            registrations={registrations}
            guests={guests}
            seatingVersions={seatingVersions}
            onRefresh={fetchAll}
          />
        </TabsContent>
      </Tabs>

      <ConfirmDialog
        open={confirmAction !== null}
        onOpenChange={open => { if (!open) setConfirmAction(null); }}
        title={confirmAction?.title || ""}
        description={confirmAction?.description || ""}
        onConfirm={() => {
          confirmAction?.onConfirm();
          setConfirmAction(null);
        }}
      />
    </div>
  );
}
