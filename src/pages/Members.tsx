import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MembershipBadge, RegionBadge } from "@/components/Badges";
import { Plus, Search } from "lucide-react";
import { toast } from "sonner";

export default function MembersPage() {
  const [members, setMembers] = useState<any[]>([]);
  const [regions, setRegions] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [regionFilter, setRegionFilter] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ first_name: "", last_name: "", email: "", company_name: "", region_id: "", membership_level: "gastlid" as string });

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

  const handleUpdateMember = async (id: string, updates: any) => {
    const { error } = await supabase.from("profiles").update(updates).eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Lid bijgewerkt"); fetchMembers(); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold">Leden</h1>
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
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map(m => (
                <TableRow key={m.id}>
                  <TableCell className="font-medium">{m.first_name} {m.last_name}</TableCell>
                  <TableCell className="text-muted-foreground">{m.company_name || "—"}</TableCell>
                  <TableCell>{m.regions?.name ? <RegionBadge name={m.regions.name} /> : "—"}</TableCell>
                  <TableCell><MembershipBadge level={m.membership_level} /></TableCell>
                  <TableCell>
                    <span className={`text-xs ${m.is_active ? "text-success" : "text-destructive"}`}>
                      {m.is_active ? "Actief" : "Inactief"}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
              {members.length === 0 && (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Geen leden gevonden</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
