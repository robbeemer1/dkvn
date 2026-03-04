import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { toast } from "sonner";
import logo from "@/assets/logo_dkvn.png";

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [isInvite, setIsInvite] = useState(false);
  const [valid, setValid] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    // Read hash before Supabase client may clear it
    const hash = window.location.hash;
    const params = new URLSearchParams(hash.replace("#", ""));
    const type = params.get("type");

    if (type === "invite" || type === "recovery" || type === "magiclink") {
      setIsInvite(type === "invite");
      setValid(true);
      setChecking(false);
      return;
    }

    // Hash may already have been consumed by Supabase client.
    // Check if there's already an active session (invite auto-signs in).
    const checkExistingSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        // Session exists — tokens were already processed.
        // Determine if this was an invite by checking if user has no password set yet
        // (invited users are auto-signed-in but still need to set a password).
        setIsInvite(true);
        setValid(true);
        setChecking(false);
        return;
      }

      // No session yet — listen for auth state changes (token still processing)
      const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
        if (event === "PASSWORD_RECOVERY") {
          setIsInvite(false);
          setValid(true);
          setChecking(false);
        } else if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
          setIsInvite(true);
          setValid(true);
          setChecking(false);
        }
      });

      // Give it time to process, then give up
      const timeout = setTimeout(() => {
        setChecking(false);
      }, 4000);

      return () => {
        subscription.unsubscribe();
        clearTimeout(timeout);
      };
    };

    checkExistingSession();
  }, []);

  useEffect(() => {
    if (!checking && !valid) {
      toast.error("Ongeldige link.");
      navigate("/login");
    }
  }, [checking, valid, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    // Update password
    const { error: pwError } = await supabase.auth.updateUser({ password });
    if (pwError) {
      toast.error(pwError.message);
      setLoading(false);
      return;
    }

    // If invite flow, also update profile with name
    if (isInvite && (firstName || lastName)) {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.from("profiles").update({
          first_name: firstName.trim(),
          last_name: lastName.trim(),
        }).eq("id", user.id);
      }
    }

    toast.success(isInvite ? "Account geactiveerd! Welkom." : "Wachtwoord gewijzigd!");
    navigate("/");
    setLoading(false);
  };

  if (checking || !valid) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground">Bezig met verifiëren...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <img src={logo} alt="De Kunst van Netwerken" className="h-12 mx-auto mb-4" />
          <CardTitle className="text-2xl font-display">
            {isInvite ? "Account activeren" : "Nieuw wachtwoord instellen"}
          </CardTitle>
          {isInvite && (
            <CardDescription>
              Welkom! Vul je gegevens in om je account te activeren.
            </CardDescription>
          )}
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {isInvite && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="firstName">Voornaam</Label>
                  <Input id="firstName" value={firstName} onChange={e => setFirstName(e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName">Achternaam</Label>
                  <Input id="lastName" value={lastName} onChange={e => setLastName(e.target.value)} required />
                </div>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="password">
                {isInvite ? "Kies een wachtwoord" : "Nieuw wachtwoord"}
              </Label>
              <Input id="password" type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={8} placeholder="Minimaal 8 tekens" />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Opslaan..." : isInvite ? "Account activeren" : "Wachtwoord opslaan"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
