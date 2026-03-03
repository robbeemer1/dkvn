import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MembershipBadge, RegionBadge } from "@/components/Badges";
import { ArrowLeft, ChevronLeft, ChevronRight, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import ConfirmDialog from "@/components/ConfirmDialog";

export default function MemberDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [member, setMember] = useState<any>(null);
  const [regions, setRegions] = useState<any[]>([]);
  const [meetings, setMeetings] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [allMemberIds, setAllMemberIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [form, setForm] = useState({
    first_name: "", last_name: "", email: "", phone: "",
    company_name: "", company_role: "", branche: "", region_id: "", membership_level: "gastlid",
    is_active: true, notes: "", bio: "",
  });

  // Load all member IDs for prev/next navigation
  useEffect(() => {
    supabase.from("profiles").select("id").order("last_name").order("first_name").then(({ data }) => {
      setAllMemberIds((data || []).map(p => p.id));
    });
    supabase.from("regions").select("*").order("name").then(({ data }) => setRegions(data || []));
  }, []);

  useEffect(() => {
    if (!id) return;
    // Fetch profile
    supabase.from("profiles").select("*, regions(name)").eq("id", id).single().then(({ data }) => {
      if (!data) return;
      setMember(data);
      setForm({
        first_name: data.first_name || "",
        last_name: data.last_name || "",
        email: data.email || "",
        phone: data.phone || "",
        company_name: data.company_name || "",
        company_role: data.company_role || "",
        branche: (data as any).branche || "",
        region_id: data.region_id || "",
        membership_level: data.membership_level || "gastlid",
        is_active: data.is_active ?? true,
        notes: data.notes || "",
        bio: data.bio || "",
      });
    });

    // Fetch meeting history
    supabase.from("meeting_history")
      .select("*, events(title, event_date)")
      .or(`member_a_id.eq.${id},member_b_id.eq.${id}`)
      .order("met_at", { ascending: false })
      .limit(200)
      .then(async ({ data: meetingData }) => {
        if (!meetingData || meetingData.length === 0) { setMeetings([]); return; }
        // Get unique partner IDs
        const partnerIds = new Set<string>();
        for (const m of meetingData) {
          partnerIds.add(m.member_a_id === id ? m.member_b_id : m.member_a_id);
        }
        const { data: profiles } = await supabase.from("profiles").select("id, first_name, last_name").in("id", [...partnerIds]);
        const profileMap: Record<string, any> = {};
        for (const p of profiles || []) profileMap[p.id] = p;

        setMeetings(meetingData.map(m => {
          const partnerId = m.member_a_id === id ? m.member_b_id : m.member_a_id;
          return { ...m, partner: profileMap[partnerId] };
        }));
      });

    // Fetch event registrations
    supabase.from("event_registrations")
      .select("*, events:event_id(title, event_date)")
      .eq("member_id", id)
      .order("registered_at", { ascending: false })
      .then(({ data }) => setEvents(data || []));
  }, [id]);

  const currentIndex = allMemberIds.indexOf(id || "");
  const prevId = currentIndex > 0 ? allMemberIds[currentIndex - 1] : null;
  const nextId = currentIndex < allMemberIds.length - 1 ? allMemberIds[currentIndex + 1] : null;

  const save = async () => {
    if (!id) return;
    setSaving(true);
    const { error } = await supabase.from("profiles").update({
      first_name: form.first_name,
      last_name: form.last_name,
      email: form.email,
      phone: form.phone || null,
      company_name: form.company_name || null,
      company_role: form.company_role || null,
      branche: form.branche || null,
      region_id: form.region_id || null,
      membership_level: form.membership_level as any,
      is_active: form.is_active,
      notes: form.notes || null,
      bio: form.bio || null,
    }).eq("id", id);
    setSaving(false);
    if (error) toast.error(error.message);
    else toast.success("Lid opgeslagen");
  };

  // Group meetings by partner to show encounter count
  const partnerCounts: Record<string, { partner: any; count: number; lastEvent: string; lastDate: string }> = {};
  for (const m of meetings) {
    const pid = m.member_a_id === id ? m.member_b_id : m.member_a_id;
    if (!partnerCounts[pid]) {
      partnerCounts[pid] = {
        partner: m.partner,
        count: 0,
        lastEvent: m.events?.title || "",
        lastDate: m.events?.event_date || m.met_at,
      };
    }
    partnerCounts[pid].count++;
  }
  const partnerList = Object.values(partnerCounts).sort((a, b) => b.count - a.count);

  if (!member) return <div className="flex items-center justify-center py-20 text-muted-foreground">Laden...</div>;

  return (
    <div className="space-y-6">
      {/* Header with navigation */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/members")}>
            <ArrowLeft size={18} />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">{member.first_name} {member.last_name}</h1>
            <div className="flex items-center gap-2 mt-1">
              {member.regions?.name && <RegionBadge name={member.regions.name} />}
              <MembershipBadge level={member.membership_level} />
              <span className={`text-xs ${member.is_active ? "text-emerald-600" : "text-destructive"}`}>
                {member.is_active ? "Actief" : "Inactief"}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled={!prevId} onClick={() => prevId && navigate(`/members/${prevId}`)}>
            <ChevronLeft size={16} className="mr-1" /> Vorige
          </Button>
          <span className="text-xs text-muted-foreground">
            {currentIndex >= 0 ? `${currentIndex + 1} / ${allMemberIds.length}` : ""}
          </span>
          <Button variant="outline" size="sm" disabled={!nextId} onClick={() => nextId && navigate(`/members/${nextId}`)}>
            Volgende <ChevronRight size={16} className="ml-1" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column: Edit form */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader><CardTitle className="text-base">Gegevens</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Voornaam</Label>
                  <Input value={form.first_name} onChange={e => setForm(f => ({ ...f, first_name: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Achternaam</Label>
                  <Input value={form.last_name} onChange={e => setForm(f => ({ ...f, last_name: e.target.value }))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>E-mail</Label>
                  <Input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Telefoon</Label>
                  <Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Bedrijf</Label>
                  <Input value={form.company_name} onChange={e => setForm(f => ({ ...f, company_name: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Functie</Label>
                  <Input value={form.company_role} onChange={e => setForm(f => ({ ...f, company_role: e.target.value }))} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Branche</Label>
                <Input value={form.branche} onChange={e => setForm(f => ({ ...f, branche: e.target.value }))} placeholder="Branche / sector..." />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Regio</Label>
                  <Select value={form.region_id || "none"} onValueChange={v => setForm(f => ({ ...f, region_id: v === "none" ? "" : v }))}>
                    <SelectTrigger><SelectValue placeholder="Kies regio" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Geen regio</SelectItem>
                      {regions.map(r => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Lidmaatschap</Label>
                  <Select value={form.membership_level} onValueChange={v => setForm(f => ({ ...f, membership_level: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="goud">Goud</SelectItem>
                      <SelectItem value="zilver">Zilver</SelectItem>
                      <SelectItem value="brons">Brons</SelectItem>
                      <SelectItem value="gastlid">Gastlid</SelectItem>
                      <SelectItem value="gast">Gast</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Bio</Label>
                <Textarea value={form.bio} onChange={e => setForm(f => ({ ...f, bio: e.target.value }))} placeholder="Korte bio..." rows={3} />
              </div>
              <div className="space-y-2">
                <Label>Notities</Label>
                <Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Interne notities..." rows={2} />
              </div>
              <div className="flex items-center gap-2">
                <Checkbox id="is_active" checked={form.is_active} onCheckedChange={v => setForm(f => ({ ...f, is_active: !!v }))} />
                <Label htmlFor="is_active">Actief lid</Label>
              </div>
              <div className="flex justify-between pt-2">
                <Button variant="destructive" size="sm" onClick={() => setShowDeleteDialog(true)}>
                  <Trash2 size={14} className="mr-2" /> Verwijderen
                </Button>
                <Button onClick={save} disabled={saving}>
                  <Save size={14} className="mr-2" />
                  {saving ? "Opslaan..." : "Opslaan"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right column: History */}
        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle className="text-base">Events ({events.length})</CardTitle></CardHeader>
            <CardContent className="p-0">
              {events.length > 0 ? (
                <div className="divide-y">
                  {events.map(e => (
                    <div
                      key={e.id}
                      className="px-4 py-3 hover:bg-muted/50 cursor-pointer"
                      onClick={() => navigate(`/events/${e.event_id}`)}
                    >
                      <p className="text-sm font-medium">{e.events?.title}</p>
                      <p className="text-xs text-muted-foreground">{e.events?.event_date}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="px-4 py-6 text-sm text-muted-foreground text-center">Nog geen events</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Ontmoetingen ({meetings.length})</CardTitle></CardHeader>
            <CardContent className="p-0">
              {partnerList.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Naam</TableHead>
                      <TableHead className="text-right w-[50px]">Keer</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {partnerList.map(p => (
                      <TableRow
                        key={p.partner?.id || Math.random()}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => p.partner?.id && navigate(`/members/${p.partner.id}`)}
                      >
                        <TableCell className="text-sm">
                          {p.partner ? `${p.partner.first_name} ${p.partner.last_name}`.trim() : "Onbekend"}
                        </TableCell>
                        <TableCell className="text-right text-sm font-medium">{p.count}×</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="px-4 py-6 text-sm text-muted-foreground text-center">Nog geen ontmoetingen</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <ConfirmDialog
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        title="Lid verwijderen"
        description={`Weet je zeker dat je ${member.first_name} ${member.last_name} wilt verwijderen? Dit kan niet ongedaan worden gemaakt.`}
        confirmLabel={deleting ? "Bezig..." : "Verwijderen"}
        variant="destructive"
        onConfirm={async () => {
          if (!id) return;
          setDeleting(true);
          const { error, count } = await supabase.from("profiles").delete({ count: "exact" }).eq("id", id);
          setDeleting(false);
          if (error) {
            toast.error(error.message);
          } else if (count === 0) {
            toast.error("Verwijderen mislukt: je hebt onvoldoende rechten.");
          } else {
            toast.success("Lid verwijderd");
            navigate("/members");
          }
        }}
      />
    </div>
  );
}
