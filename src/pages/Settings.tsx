import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MembershipBadge } from "@/components/Badges";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import OrgMembers from "@/components/OrgMembers";

export default function SettingsPage() {
  const { profile, refreshProfile, roles } = useAuth();
  const [firstName, setFirstName] = useState(profile?.first_name || "");
  const [lastName, setLastName] = useState(profile?.last_name || "");
  const [company, setCompany] = useState(profile?.company_name || "");
  const [phone, setPhone] = useState(profile?.phone || "");
  const [saving, setSaving] = useState(false);

  const isSuperAdmin = roles.includes("super_admin");

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    setSaving(true);
    const { error } = await supabase.from("profiles").update({
      first_name: firstName, last_name: lastName, company_name: company, phone: phone,
    }).eq("id", profile.id);
    if (error) toast.error(error.message);
    else { toast.success("Profiel bijgewerkt"); refreshProfile(); }
    setSaving(false);
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <h1 className="text-3xl font-display font-bold">Instellingen</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-display">Mijn profiel</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Voornaam</Label>
                <Input value={firstName} onChange={e => setFirstName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Achternaam</Label>
                <Input value={lastName} onChange={e => setLastName(e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Bedrijf</Label>
              <Input value={company} onChange={e => setCompany(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Telefoon</Label>
              <Input value={phone} onChange={e => setPhone(e.target.value)} />
            </div>
            <div className="flex items-center gap-4">
              <div className="space-y-1">
                <Label className="text-muted-foreground text-xs">Lidmaatschap</Label>
                <div>{profile?.membership_level && <MembershipBadge level={profile.membership_level} />}</div>
              </div>
              <div className="space-y-1">
                <Label className="text-muted-foreground text-xs">Regio</Label>
                <p className="text-sm">{profile?.regions?.name || "Niet ingesteld"}</p>
              </div>
              <div className="space-y-1">
                <Label className="text-muted-foreground text-xs">Rollen</Label>
                <p className="text-sm capitalize">{roles.length > 0 ? roles.join(", ") : "Lid"}</p>
              </div>
            </div>
            <Button type="submit" disabled={saving}>{saving ? "Opslaan..." : "Profiel opslaan"}</Button>
          </form>
        </CardContent>
      </Card>

      {isSuperAdmin && <OrgMembers />}
    </div>
  );
}
