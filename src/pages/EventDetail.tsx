import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MembershipBadge, StatusBadge, RegionBadge } from "@/components/Badges";
import { ArrowLeft, Plus, UserPlus, Armchair, Sparkles } from "lucide-react";
import { toast } from "sonner";

export default function EventDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [event, setEvent] = useState<any>(null);
  const [registrations, setRegistrations] = useState<any[]>([]);
  const [guests, setGuests] = useState<any[]>([]);
  const [rounds, setRounds] = useState<any[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [addMemberDialog, setAddMemberDialog] = useState(false);
  const [addGuestDialog, setAddGuestDialog] = useState(false);
  const [selectedMember, setSelectedMember] = useState("");
  const [guestForm, setGuestForm] = useState({ first_name: "", last_name: "", email: "", company_name: "" });
  const [seatingVersions, setSeatingVersions] = useState<any[]>([]);

  const fetchAll = async () => {
    if (!id) return;
    const [ev, regs, gs, rnds, vers] = await Promise.all([
      supabase.from("events").select("*, regions(name)").eq("id", id).single(),
      supabase.from("event_registrations").select("*, profiles:member_id(first_name, last_name, company_name, membership_level, regions(name))").eq("event_id", id),
      supabase.from("event_guests").select("*").eq("event_id", id),
      supabase.from("event_rounds").select("*, event_tables(*, table_seats(*, profiles:member_id(first_name, last_name)))").eq("event_id", id).order("round_number"),
      supabase.from("seating_versions").select("*").eq("event_id", id).order("version_number", { ascending: false }),
    ]);
    setEvent(ev.data);
    setRegistrations(regs.data || []);
    setGuests(gs.data || []);
    setRounds(rnds.data || []);
    setSeatingVersions(vers.data || []);
  };

  useEffect(() => { fetchAll(); }, [id]);

  useEffect(() => {
    supabase.from("profiles").select("id, first_name, last_name, company_name").order("last_name").then(({ data }) => setMembers(data || []));
  }, []);

  const addRegistration = async () => {
    if (!selectedMember || !id) return;
    const { error } = await supabase.from("event_registrations").insert({ event_id: id, member_id: selectedMember });
    if (error) toast.error(error.message);
    else { toast.success("Lid toegevoegd"); setAddMemberDialog(false); setSelectedMember(""); fetchAll(); }
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

  const generateSeating = async () => {
    if (!id) return;
    toast.info("Tafelindeling wordt gegenereerd...");
    try {
      const res = await supabase.functions.invoke("generate-seating", { body: { event_id: id } });
      if (res.error) throw res.error;
      toast.success("Tafelindeling gegenereerd!");
      fetchAll();
    } catch (err: any) {
      toast.error(err.message || "Fout bij genereren");
    }
  };

  if (!event) return <div className="p-8 text-muted-foreground">Laden...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => navigate("/events")}><ArrowLeft size={16} /></Button>
        <div>
          <h1 className="text-3xl font-display font-bold">{event.title}</h1>
          <p className="text-muted-foreground">
            {event.regions?.name} · {new Date(event.event_date).toLocaleDateString("nl-NL")}
            {event.location_name ? ` · ${event.location_name}` : ""}
          </p>
        </div>
      </div>

      <Tabs defaultValue="attendees">
        <TabsList>
          <TabsTrigger value="attendees">Deelnemers ({registrations.length + guests.length})</TabsTrigger>
          <TabsTrigger value="seating">Tafelindeling ({rounds.length} rondes)</TabsTrigger>
        </TabsList>

        <TabsContent value="attendees" className="space-y-4">
          <div className="flex gap-2">
            <Dialog open={addMemberDialog} onOpenChange={setAddMemberDialog}>
              <DialogTrigger asChild><Button size="sm"><UserPlus size={14} className="mr-1" />Lid toevoegen</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Lid toevoegen aan event</DialogTitle></DialogHeader>
                <div className="space-y-4">
                  <Select value={selectedMember} onValueChange={setSelectedMember}>
                    <SelectTrigger><SelectValue placeholder="Kies een lid" /></SelectTrigger>
                    <SelectContent>
                      {members.filter(m => !registrations.some(r => r.member_id === m.id)).map(m => (
                        <SelectItem key={m.id} value={m.id}>{m.first_name} {m.last_name} {m.company_name ? `(${m.company_name})` : ""}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button onClick={addRegistration} className="w-full">Toevoegen</Button>
                </div>
              </DialogContent>
            </Dialog>
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
          </div>

          <Card>
            <CardHeader><CardTitle className="text-sm font-semibold">Leden ({registrations.length})</CardTitle></CardHeader>
            <CardContent className="p-0">
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
                  {registrations.map(r => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.profiles?.first_name} {r.profiles?.last_name}</TableCell>
                      <TableCell className="text-muted-foreground">{r.profiles?.company_name || "—"}</TableCell>
                      <TableCell>{r.profiles?.membership_level && <MembershipBadge level={r.profiles.membership_level} />}</TableCell>
                      <TableCell><StatusBadge status={r.status} /></TableCell>
                      <TableCell>
                        <Select value={r.status} onValueChange={v => updateStatus(r.id, v)}>
                          <SelectTrigger className="w-[130px] h-8 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {["aangemeld","bevestigd","aanwezig","afgemeld","no_show"].map(s => (
                              <SelectItem key={s} value={s} className="text-xs capitalize">{s.replace("_"," ")}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
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
                  <TableHeader><TableRow><TableHead>Naam</TableHead><TableHead>Bedrijf</TableHead><TableHead>E-mail</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {guests.map(g => (
                      <TableRow key={g.id}>
                        <TableCell className="font-medium">{g.first_name} {g.last_name}</TableCell>
                        <TableCell className="text-muted-foreground">{g.company_name || "—"}</TableCell>
                        <TableCell className="text-muted-foreground">{g.email || "—"}</TableCell>
                        <TableCell><StatusBadge status={g.status} /></TableCell>
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
            <Button size="sm" variant="outline" onClick={generateSeating}><Sparkles size={14} className="mr-1" />Genereer indeling</Button>
          </div>

          {rounds.length === 0 ? (
            <Card><CardContent className="py-8 text-center text-muted-foreground">Nog geen rondes aangemaakt. Voeg rondes toe om tafelindelingen te genereren.</CardContent></Card>
          ) : (
            rounds.map(round => (
              <Card key={round.id}>
                <CardHeader><CardTitle className="text-lg font-display">{round.name || `Ronde ${round.round_number}`}</CardTitle></CardHeader>
                <CardContent>
                  {round.event_tables?.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {round.event_tables.map((table: any) => (
                        <div key={table.id} className="border rounded-lg p-4 bg-muted/30">
                          <h4 className="font-semibold text-sm mb-2">{table.table_name || `Tafel ${table.table_number}`} <span className="text-muted-foreground font-normal">({table.table_seats?.length || 0}/{table.capacity})</span></h4>
                          {table.table_seats?.length > 0 ? (
                            <ul className="space-y-1 text-sm">
                              {table.table_seats
                                .sort((a: any, b: any) => (a.seat_number || 0) - (b.seat_number || 0))
                                .map((seat: any) => (
                                <li key={seat.id} className="text-muted-foreground">
                                  • {seat.profiles ? `${seat.profiles.first_name} ${seat.profiles.last_name}`.trim() : `Stoel ${seat.seat_number || '?'}`}
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p className="text-xs text-muted-foreground">Nog geen stoelen toegewezen</p>
                          )}
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

          {seatingVersions.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-lg font-display">Versiegeschiedenis</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {seatingVersions.map(v => (
                    <div key={v.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                      <div>
                        <p className="font-medium text-sm">Versie {v.version_number}</p>
                        <p className="text-xs text-muted-foreground">{new Date(v.created_at).toLocaleString("nl-NL")}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {v.score && <span className="text-sm font-medium text-primary">Score: {v.score}</span>}
                        <span className={`text-xs px-2 py-1 rounded-full ${v.status === "gepubliceerd" ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"}`}>
                          {v.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
