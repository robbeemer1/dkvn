import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MembershipBadge, RegionBadge } from "@/components/Badges";
import { Search, Pencil } from "lucide-react";
import { toast } from "sonner";

export default function MembersPage() {
  const [members, setMembers] = useState<any[]>([]);
  const [regions, setRegions] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [regionFilter, setRegionFilter] = useState("all");
  const [editMember, setEditMember] = useState<any>(null);
  const [editForm, setEditForm] = useState({
    first_name: "", last_name: "", email: "", phone: "",
    company_name: "", company_role: "", region_id: "", membership_level: "gastlid",
    is_active: true, notes: "",
  });

  const fetchMembers = async () => {
    let query = supabase.from("profiles").select("*, regions(name)").order("last_name");
    if (regionFilter !== "all") query = query.eq("region_id", regionFilter);
    if (search) query = query.or(`first_name.ilike.%${search}%,last_name.ilike.%${search}%,company_name.ilike.%${search}%`);
    const { data } = await query;
    setMembers(data || []);
  };

  useEffect(() => {
    supabase.from("regions").select("*").order("name").then(({ data }) => setRegions(data || []));
  }, []);

  useEffect(() => { fetchMembers(); }, [search, regionFilter]);

  const openEdit = (m: any) => {
    setEditMember(m);
    setEditForm({
      first_name: m.first_name || "",
      last_name: m.last_name || "",
      email: m.email || "",
      phone: m.phone || "",
      company_name: m.company_name || "",
      company_role: m.company_role || "",
      region_id: m.region_id || "",
      membership_level: m.membership_level || "gastlid",
      is_active: m.is_active ?? true,
      notes: m.notes || "",
    });
  };

  const saveEdit = async () => {
    if (!editMember) return;
    const { error } = await supabase.from("profiles").update({
      first_name: editForm.first_name,
      last_name: editForm.last_name,
      email: editForm.email,
      phone: editForm.phone || null,
      company_name: editForm.company_name || null,
      company_role: editForm.company_role || null,
      region_id: editForm.region_id || null,
      membership_level: editForm.membership_level as any,
      is_active: editForm.is_active,
      notes: editForm.notes || null,
    }).eq("id", editMember.id);
    if (error) toast.error(error.message);
    else {
      toast.success("Lid bijgewerkt");
      setEditMember(null);
      fetchMembers();
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Leden</h1>
          <p className="text-muted-foreground mt-1">{members.length} leden gevonden</p>
        </div>
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
            {regions.map(r => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Naam</TableHead>
                <TableHead>Bedrijf</TableHead>
                <TableHead>Regio</TableHead>
                <TableHead>Niveau</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[60px]">Acties</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map(m => (
                <TableRow key={m.id} className="cursor-pointer hover:bg-muted/50" onClick={() => openEdit(m)}>
                  <TableCell className="font-medium">{m.first_name} {m.last_name}</TableCell>
                  <TableCell className="text-muted-foreground">{m.company_name || "—"}</TableCell>
                  <TableCell>{m.regions?.name ? <RegionBadge name={m.regions.name} /> : "—"}</TableCell>
                  <TableCell><MembershipBadge level={m.membership_level} /></TableCell>
                  <TableCell>
                    <span className={`text-xs ${m.is_active ? "text-emerald-600" : "text-destructive"}`}>
                      {m.is_active ? "Actief" : "Inactief"}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); openEdit(m); }}>
                      <Pencil size={14} />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {members.length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Geen leden gevonden</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Edit Member Dialog */}
      <Dialog open={!!editMember} onOpenChange={(open) => { if (!open) setEditMember(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Lid bewerken</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Voornaam</Label>
                <Input value={editForm.first_name} onChange={e => setEditForm(f => ({ ...f, first_name: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Achternaam</Label>
                <Input value={editForm.last_name} onChange={e => setEditForm(f => ({ ...f, last_name: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>E-mail</Label>
                <Input type="email" value={editForm.email} onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Telefoon</Label>
                <Input value={editForm.phone} onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Bedrijf</Label>
                <Input value={editForm.company_name} onChange={e => setEditForm(f => ({ ...f, company_name: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Functie</Label>
                <Input value={editForm.company_role} onChange={e => setEditForm(f => ({ ...f, company_role: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Regio</Label>
                <Select value={editForm.region_id || "none"} onValueChange={v => setEditForm(f => ({ ...f, region_id: v === "none" ? "" : v }))}>
                  <SelectTrigger><SelectValue placeholder="Kies regio" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Geen regio</SelectItem>
                    {regions.map(r => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Lidmaatschap</Label>
                <Select value={editForm.membership_level} onValueChange={v => setEditForm(f => ({ ...f, membership_level: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="goud">Goud</SelectItem>
                    <SelectItem value="zilver">Zilver</SelectItem>
                    <SelectItem value="brons">Brons</SelectItem>
                    <SelectItem value="gastlid">Gastlid</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Notities</Label>
              <Input value={editForm.notes} onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))} placeholder="Eventuele notities..." />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="is_active"
                checked={editForm.is_active}
                onChange={e => setEditForm(f => ({ ...f, is_active: e.target.checked }))}
                className="rounded border-border"
              />
              <Label htmlFor="is_active">Actief lid</Label>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setEditMember(null)}>Annuleren</Button>
              <Button onClick={saveEdit}>Opslaan</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
