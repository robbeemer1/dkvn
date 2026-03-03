import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import logo from "@/assets/logo_dkvn.png";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      toast.error(error.message);
    } else {
      navigate("/");
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center flex flex-col items-center">
          <img src={logo} alt="De Kunst van Netwerken" className="h-24 w-24 mb-2" />
          <CardTitle className="text-2xl font-bold">De Kunst van Netwerken</CardTitle>
          <CardDescription>Log in om door te gaan</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">E-mail</Label>
              <Input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Wachtwoord</Label>
              <Input id="password" type="password" value={password} onChange={e => setPassword(e.target.value)} required />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Inloggen..." : "Inloggen"}
            </Button>
          </form>
          <div className="mt-4 text-center text-sm text-muted-foreground space-y-1">
            <p><Link to="/register" className="text-primary hover:underline">Account aanmaken</Link></p>
            <p><Link to="/forgot-password" className="text-primary hover:underline">Wachtwoord vergeten?</Link></p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
