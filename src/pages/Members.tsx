import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { MembershipBadge, RegionBadge } from "@/components/Badges";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const LEVELS = [
  { value: "all", label: "Alle" },
  { value: "goud", label: "Goud" },
  { value: "zilver", label: "Zilver" },
  { value: "brons", label: "Brons" },
  { value: "gastlid", label: "Gastlid" },
  { value: "gast", label: "Gast (geen)" },
] as const;

export default function MembersPage() {
  const navigate = useNavigate();
  const [members, setMembers] = useState<any[]>([]);
  const [regions, setRegions] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [regionFilter, setRegionFilter] = useState("all");
  const [levelFilter, setLevelFilter] = useState("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Batch action dialogs
  const [showLevelDialog, setShowLevelDialog] = useState(false);
  const [showRegionDialog, setShowRegionDialog] = useState(false);
  const [showEventDialog, setShowEventDialog] = useState(false);
  const [batchLevel, setBatchLevel] = useState("gastlid");
  const [batchRegion, setBatchRegion] = useState("none");
  const [batchEvent, setBatchEvent] = useState("");
  const [saving, setSaving] = useState(false);

  const fetchMembers = async () => {
    // First get IDs of org members (super_admin, region_admin, event_organizer) to exclude
    const { data: orgRoles } = await supabase
      .from("user_roles")
      .select("user_id")
      .in("role", ["super_admin", "region_admin", "event_organizer"]);
    const orgIds = [...new Set((orgRoles || []).map(r => r.user_id))];

    let query = supabase.from("profiles").select("*, regions(name)").order("last_name").order("first_name");
    if (orgIds.length > 0) {
      query = query.not("id", "in", `(${orgIds.join(",")})`);
    }
    if (regionFilter === "none") {
      query = query.is("region_id", null);
    } else if (regionFilter !== "all") {
      query = query.eq("region_id", regionFilter);
    }
    if (levelFilter !== "all" && levelFilter !== "gast") {
      query = query.eq("membership_level", levelFilter as any);
    }
    if (search) query = query.or(`first_name.ilike.%${search}%,last_name.ilike.%${search}%,company_name.ilike.%${search}%`);
    const { data } = await query;
    setMembers(data || []);
  };

  useEffect(() => {
    supabase.from("regions").select("*").order("name").then(({ data }) => setRegions(data || []));
    supabase.from("events").select("id, title, event_date").order("event_date", { ascending: false }).limit(50).then(({ data }) => setEvents(data || []));
  }, []);

  useEffect(() => { fetchMembers(); }, [search, regionFilter, levelFilter]);

  // Selection helpers
  const allSelected = members.length > 0 && members.every(m => selected.has(m.id));
  const someSelected = selected.size > 0;

  const toggleAll = () => {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(members.map(m => m.id)));
    }
  };

  const toggleOne = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const clearSelection = () => setSelected(new Set());

  // Batch actions
  const doBatchLevel = async () => {
    setSaving(true);
    const { error } = await supabase.from("profiles").update({ membership_level: batchLevel as any }).in("id", [...selected]);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`${selected.size} leden bijgewerkt`);
    setShowLevelDialog(false);
    clearSelection();
    fetchMembers();
  };

  const doBatchRegion = async () => {
    setSaving(true);
    const regionId = batchRegion === "none" ? null : batchRegion;
    const { error } = await supabase.from("profiles").update({ region_id: regionId }).in("id", [...selected]);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`${selected.size} leden bijgewerkt`);
    setShowRegionDialog(false);
    clearSelection();
    fetchMembers();
  };

  const doBatchEvent = async () => {
    if (!batchEvent) return;
    setSaving(true);
    const rows = [...selected].map(memberId => ({
      event_id: batchEvent,
      member_id: memberId,
      status: "aangemeld" as const,
    }));
    const { error } = await supabase.from("event_registrations").upsert(rows, { onConflict: "event_id,member_id", ignoreDuplicates: true });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`${selected.size} leden toegevoegd aan evenement`);
    setShowEventDialog(false);
    clearSelection();
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Leden</h1>
        <p className="text-muted-foreground mt-1">{members.length} leden gevonden</p>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
          <Input placeholder="Zoek op naam of bedrijf..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={regionFilter} onValueChange={setRegionFilter}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="Alle regio's" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle regio's</SelectItem>
            <SelectItem value="none">Geen regio</SelectItem>
            {regions.map(r => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {LEVELS.map(l => (
          <Button
            key={l.value}
            variant={levelFilter === l.value ? "default" : "outline"}
            size="sm"
            className={cn("text-xs", levelFilter === l.value ? "" : "text-muted-foreground")}
            onClick={() => setLevelFilter(l.value)}
          >
            {l.label}
          </Button>
        ))}
      </div>

      {/* Batch action bar */}
      {someSelected && (
        <div className="flex items-center gap-3 bg-primary/10 border border-primary/20 rounded-lg px-4 py-3">
          <span className="text-sm font-medium">{selected.size} geselecteerd</span>
          <Button size="sm" variant="outline" onClick={() => setShowLevelDialog(true)}>Niveau wijzigen</Button>
          <Button size="sm" variant="outline" onClick={() => setShowRegionDialog(true)}>Regio wijzigen</Button>
          <Button size="sm" variant="outline" onClick={() => setShowEventDialog(true)}>Toevoegen aan event</Button>
          <Button size="sm" variant="ghost" onClick={clearSelection}><X size={14} className="mr-1" /> Deselecteren</Button>
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[40px]">
                  <Checkbox checked={allSelected} onCheckedChange={toggleAll} />
                </TableHead>
                <TableHead>Naam</TableHead>
                <TableHead>Bedrijf</TableHead>
                <TableHead>Branche</TableHead>
                <TableHead>Regio</TableHead>
                <TableHead>Niveau</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map(m => (
                <TableRow key={m.id} className="cursor-pointer hover:bg-muted/50">
                  <TableCell onClick={e => e.stopPropagation()}>
                    <Checkbox checked={selected.has(m.id)} onCheckedChange={() => toggleOne(m.id)} />
                  </TableCell>
                  <TableCell className="font-medium" onClick={() => navigate(`/members/${m.id}`)}>{m.first_name} {m.last_name}</TableCell>
                  <TableCell className="text-muted-foreground" onClick={() => navigate(`/members/${m.id}`)}>{m.company_name || "—"}</TableCell>
                  <TableCell className="text-muted-foreground" onClick={() => navigate(`/members/${m.id}`)}>{(m as any).branche || "—"}</TableCell>
                  <TableCell onClick={() => navigate(`/members/${m.id}`)}>{m.regions?.name ? <RegionBadge name={m.regions.name} /> : "—"}</TableCell>
                  <TableCell onClick={() => navigate(`/members/${m.id}`)}><MembershipBadge level={m.membership_level} /></TableCell>
                  <TableCell onClick={() => navigate(`/members/${m.id}`)}>
                    <span className={`text-xs ${m.is_active ? "text-emerald-600" : "text-destructive"}`}>
                      {m.is_active ? "Actief" : "Inactief"}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
              {members.length === 0 && (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Geen leden gevonden</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Batch: Niveau wijzigen */}
      <Dialog open={showLevelDialog} onOpenChange={setShowLevelDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Niveau wijzigen ({selected.size} leden)</DialogTitle></DialogHeader>
          <Select value={batchLevel} onValueChange={setBatchLevel}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="goud">Goud</SelectItem>
              <SelectItem value="zilver">Zilver</SelectItem>
              <SelectItem value="brons">Brons</SelectItem>
              <SelectItem value="gastlid">Gastlid</SelectItem>
              <SelectItem value="gast">Gast</SelectItem>
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowLevelDialog(false)}>Annuleren</Button>
            <Button onClick={doBatchLevel} disabled={saving}>{saving ? "Bezig..." : "Opslaan"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Batch: Regio wijzigen */}
      <Dialog open={showRegionDialog} onOpenChange={setShowRegionDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Regio wijzigen ({selected.size} leden)</DialogTitle></DialogHeader>
          <Select value={batchRegion} onValueChange={setBatchRegion}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Geen regio</SelectItem>
              {regions.map(r => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRegionDialog(false)}>Annuleren</Button>
            <Button onClick={doBatchRegion} disabled={saving}>{saving ? "Bezig..." : "Opslaan"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Batch: Toevoegen aan event */}
      <Dialog open={showEventDialog} onOpenChange={setShowEventDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Toevoegen aan evenement ({selected.size} leden)</DialogTitle></DialogHeader>
          <Select value={batchEvent} onValueChange={setBatchEvent}>
            <SelectTrigger><SelectValue placeholder="Kies een evenement..." /></SelectTrigger>
            <SelectContent>
              {events.map(e => (
                <SelectItem key={e.id} value={e.id}>{e.title} ({e.event_date})</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEventDialog(false)}>Annuleren</Button>
            <Button onClick={doBatchEvent} disabled={saving || !batchEvent}>{saving ? "Bezig..." : "Toevoegen"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
