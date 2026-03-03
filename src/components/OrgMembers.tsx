import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2, Plus, UserPlus, Shield, ShieldCheck, Users } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";

interface OrgMember {
  id: string;
  user_id: string;
  role: string;
  region_id: string | null;
  email: string | null;
  first_name: string;
  last_name: string;
}

const ROLE_LABELS: Record<string, { label: string; icon: React.ReactNode }> = {
  super_admin: { label: "Super Admin", icon: <ShieldCheck size={14} /> },
  region_admin: { label: "Regio Admin", icon: <Shield size={14} /> },
  event_organizer: { label: "Event Organisator", icon: <Users size={14} /> },
  member: { label: "Gebruiker", icon: <Users size={14} /> },
  readonly: { label: "Alleen lezen", icon: <Users size={14} /> },
};

const ASSIGNABLE_ROLES = ["super_admin", "region_admin", "event_organizer", "member", "readonly"];

export default function OrgMembers() {
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("member");
  const [adding, setAdding] = useState(false);

  const fetchMembers = async () => {
    setLoading(true);
    // Get all user_roles with profile info
    const { data: roles } = await supabase
      .from("user_roles")
      .select("id, user_id, role, region_id");

    if (!roles || roles.length === 0) {
      setMembers([]);
      setLoading(false);
      return;
    }

    const userIds = [...new Set(roles.map(r => r.user_id))];
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, first_name, last_name, email")
      .in("id", userIds);

    const profileMap = new Map((profiles || []).map(p => [p.id, p]));

    const merged: OrgMember[] = roles.map(r => {
      const p = profileMap.get(r.user_id);
      return {
        id: r.id,
        user_id: r.user_id,
        role: r.role,
        region_id: r.region_id,
        email: p?.email || null,
        first_name: p?.first_name || "",
        last_name: p?.last_name || "",
      };
    });

    // Sort: super_admin first, then alphabetically
    merged.sort((a, b) => {
      const order = ASSIGNABLE_ROLES;
      const diff = order.indexOf(a.role) - order.indexOf(b.role);
      if (diff !== 0) return diff;
      return `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`);
    });

    setMembers(merged);
    setLoading(false);
  };

  useEffect(() => { fetchMembers(); }, []);

  const addMember = async () => {
    if (!inviteEmail.trim()) return;
    setAdding(true);

    // Find user by email in profiles
    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .eq("email", inviteEmail.trim().toLowerCase())
      .single();

    if (!profile) {
      toast.error("Geen gebruiker gevonden met dit e-mailadres. De gebruiker moet eerst een account aanmaken.");
      setAdding(false);
      return;
    }

    // Check if role already exists
    const existing = members.find(m => m.user_id === profile.id && m.role === inviteRole);
    if (existing) {
      toast.error("Deze gebruiker heeft deze rol al.");
      setAdding(false);
      return;
    }

    const { error } = await supabase.from("user_roles").insert({
      user_id: profile.id,
      role: inviteRole,
    } as any);

    if (error) toast.error(error.message);
    else {
      toast.success("Organisatielid toegevoegd");
      setInviteEmail("");
      fetchMembers();
    }
    setAdding(false);
  };

  const updateRole = async (id: string, newRole: string) => {
    const { error } = await supabase.from("user_roles").update({ role: newRole } as any).eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Rol bijgewerkt"); fetchMembers(); }
  };

  const removeMember = async (id: string) => {
    const { error } = await supabase.from("user_roles").delete().eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Organisatielid verwijderd"); fetchMembers(); }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg font-display flex items-center gap-2">
          <UserPlus size={18} />
          Organisatieleden
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Beheer de gebruikers die toegang hebben tot het platform. Dit zijn geen leden/gasten, maar de mensen die het systeem beheren.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Add member */}
        <div className="flex gap-2 items-end flex-wrap">
          <div className="flex-1 min-w-[200px]">
            <label className="text-sm font-medium">E-mailadres</label>
            <Input
              value={inviteEmail}
              onChange={e => setInviteEmail(e.target.value)}
              placeholder="gebruiker@voorbeeld.nl"
              type="email"
              onKeyDown={e => e.key === "Enter" && addMember()}
            />
          </div>
          <div className="w-48">
            <label className="text-sm font-medium">Rol</label>
            <Select value={inviteRole} onValueChange={setInviteRole}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {ASSIGNABLE_ROLES.map(r => (
                  <SelectItem key={r} value={r}>{ROLE_LABELS[r]?.label || r}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={addMember} disabled={adding} size="sm">
            <Plus size={14} className="mr-1" />Toevoegen
          </Button>
        </div>

        {/* Members list */}
        <div className="border rounded-lg overflow-hidden">
          <div className="grid grid-cols-[1fr_1fr_160px_40px] gap-2 px-4 py-2 bg-muted/50 text-xs font-medium text-muted-foreground border-b">
            <span>Naam</span>
            <span>E-mail</span>
            <span>Rol</span>
            <span></span>
          </div>
          {loading ? (
            <p className="text-sm text-muted-foreground text-center py-6">Laden...</p>
          ) : members.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">Nog geen organisatieleden</p>
          ) : (
            <div className="divide-y">
              {members.map(m => (
                <div key={m.id} className="grid grid-cols-[1fr_1fr_160px_40px] gap-2 px-4 py-3 items-center group hover:bg-muted/20">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-sm font-medium truncate">{m.first_name} {m.last_name}</span>
                  </div>
                  <span className="text-sm text-muted-foreground truncate">{m.email || "—"}</span>
                  <Select value={m.role} onValueChange={v => updateRole(m.id, v)}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ASSIGNABLE_ROLES.map(r => (
                        <SelectItem key={r} value={r}>{ROLE_LABELS[r]?.label || r}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100"
                    onClick={() => removeMember(m.id)}>
                    <Trash2 size={13} className="text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
