import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2, Plus, UserPlus, Shield, ShieldCheck, Users, Mail } from "lucide-react";
import { toast } from "sonner";
import ConfirmDialog from "@/components/ConfirmDialog";

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
  const [confirmAction, setConfirmAction] = useState<{ title: string; description: string; onConfirm: () => void } | null>(null);

  const fetchMembers = async () => {
    setLoading(true);
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
    const email = inviteEmail.trim().toLowerCase();
    if (!email) return;
    setAdding(true);

    // First check if user exists in profiles
    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .eq("email", email)
      .maybeSingle();

    if (profile) {
      // User exists — check if they already have this role
      const existing = members.find(m => m.user_id === profile.id && m.role === inviteRole);
      if (existing) {
        toast.error("Deze gebruiker heeft deze rol al.");
        setAdding(false);
        return;
      }

      // Check if user has ANY org role currently
      const hasAnyRole = members.some(m => m.user_id === profile.id);
      if (hasAnyRole) {
        // Active org member — just add the new role
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
        return;
      }

      // Profile exists but no org roles — this is a previously removed user
      // Force re-invite to send a new welcome email
      try {
        const { data, error } = await supabase.functions.invoke("invite-user", {
          body: { email, role: inviteRole, forceReinvite: true },
        });

        if (error) {
          toast.error("Fout bij uitnodigen: " + error.message);
        } else if (data?.error) {
          toast.error(data.error);
        } else {
          toast.success("Uitnodiging verstuurd! De gebruiker ontvangt een e-mail om een wachtwoord aan te maken.", {
            icon: <Mail size={16} />,
            duration: 5000,
          });
          setInviteEmail("");
          fetchMembers();
        }
      } catch (err: any) {
        toast.error("Fout bij uitnodigen: " + (err.message || "Onbekende fout"));
      }
      setAdding(false);
      return;
    }

    // User doesn't exist — invite via edge function
    try {
      const { data, error } = await supabase.functions.invoke("invite-user", {
        body: { email, role: inviteRole },
      });

      if (error) {
        toast.error("Fout bij uitnodigen: " + error.message);
        setAdding(false);
        return;
      }

      if (data?.error === "exists") {
        // Edge case: profile exists but we didn't find it (race condition)
        const existingRole = members.find(m => m.user_id === data.user_id && m.role === inviteRole);
        if (existingRole) {
          toast.error("Deze gebruiker heeft deze rol al.");
        } else {
          const { error: roleError } = await supabase.from("user_roles").insert({
            user_id: data.user_id,
            role: inviteRole,
          } as any);
          if (roleError) toast.error(roleError.message);
          else {
            toast.success("Organisatielid toegevoegd");
            setInviteEmail("");
            fetchMembers();
          }
        }
        setAdding(false);
        return;
      }

      if (data?.error) {
        toast.error(data.error);
        setAdding(false);
        return;
      }

      toast.success("Uitnodiging verstuurd! De gebruiker ontvangt een e-mail om een wachtwoord aan te maken.", {
        icon: <Mail size={16} />,
        duration: 5000,
      });
      setInviteEmail("");
      fetchMembers();
    } catch (err: any) {
      toast.error("Fout bij uitnodigen: " + (err.message || "Onbekende fout"));
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
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-display flex items-center gap-2">
            <UserPlus size={18} />
            Organisatieleden
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Beheer de gebruikers die toegang hebben tot het platform. Voer een e-mailadres in — als de gebruiker nog geen account heeft, wordt er automatisch een uitnodiging verstuurd.
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
              <Plus size={14} className="mr-1" />{adding ? "Bezig..." : "Toevoegen"}
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
                      <span className="text-sm font-medium truncate">
                        {m.first_name || m.last_name ? `${m.first_name} ${m.last_name}`.trim() : <span className="text-muted-foreground italic">Uitgenodigd</span>}
                      </span>
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
                      onClick={() => setConfirmAction({
                        title: "Organisatielid verwijderen",
                        description: `Weet je zeker dat je ${m.first_name ? `${m.first_name} ${m.last_name}`.trim() : m.email || "dit lid"} wilt verwijderen?`,
                        onConfirm: () => removeMember(m.id),
                      })}>
                      <Trash2 size={13} className="text-destructive" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <ConfirmDialog
        open={!!confirmAction}
        onOpenChange={open => !open && setConfirmAction(null)}
        title={confirmAction?.title || ""}
        description={confirmAction?.description || ""}
        onConfirm={() => { confirmAction?.onConfirm(); setConfirmAction(null); }}
      />
    </>
  );
}
