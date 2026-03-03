import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ClipboardPaste, Check, UserPlus, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface PasteAttendeesProps {
  eventId: string;
  existingMemberIds: string[];
  onDone: () => void;
}

interface MatchResult {
  name: string;
  profileId: string;
  profileName: string;
  company?: string;
}

interface UnmatchedEntry {
  raw: string;
  firstName: string;
  lastName: string;
  selected: boolean;
}

export default function PasteAttendees({ eventId, existingMemberIds, onDone }: PasteAttendeesProps) {
  const [open, setOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [step, setStep] = useState<"paste" | "results">("paste");
  const [matched, setMatched] = useState<MatchResult[]>([]);
  const [unmatched, setUnmatched] = useState<UnmatchedEntry[]>([]);
  const [processing, setProcessing] = useState(false);
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setPasteText("");
    setStep("paste");
    setMatched([]);
    setUnmatched([]);
  };

  const normalize = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

  const processNames = async () => {
    const lines = pasteText
      .split(/[\n,;]+/)
      .map(l => l.trim())
      .filter(l => l.length > 1);

    if (lines.length === 0) {
      toast.error("Geen namen gevonden");
      return;
    }

    setProcessing(true);
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, first_name, last_name, company_name");

    const allProfiles = profiles || [];
    const matchedList: MatchResult[] = [];
    const unmatchedList: UnmatchedEntry[] = [];

    for (const line of lines) {
      const norm = normalize(line);
      // Try full name match
      const match = allProfiles.find(p => {
        const full = normalize(`${p.first_name} ${p.last_name}`);
        return full === norm;
      }) || allProfiles.find(p => {
        // Try last name only if unique
        return normalize(p.last_name) === norm;
      }) || allProfiles.find(p => {
        // Fuzzy: check if input contains both first and last
        const fn = normalize(p.first_name);
        const ln = normalize(p.last_name);
        return fn.length > 1 && ln.length > 1 && norm.includes(fn) && norm.includes(ln);
      });

      if (match && !existingMemberIds.includes(match.id) && !matchedList.some(m => m.profileId === match.id)) {
        matchedList.push({
          name: line,
          profileId: match.id,
          profileName: `${match.first_name} ${match.last_name}`,
          company: match.company_name || undefined,
        });
      } else if (!match) {
        const parts = line.split(/\s+/);
        const firstName = parts[0] || line;
        const lastName = parts.slice(1).join(" ") || "";
        unmatchedList.push({ raw: line, firstName, lastName, selected: false });
      }
    }

    setMatched(matchedList);
    setUnmatched(unmatchedList);
    setStep("results");
    setProcessing(false);
  };

  const toggleUnmatched = (idx: number) => {
    setUnmatched(prev => prev.map((u, i) => i === idx ? { ...u, selected: !u.selected } : u));
  };

  const selectAllUnmatched = () => {
    const allSelected = unmatched.every(u => u.selected);
    setUnmatched(prev => prev.map(u => ({ ...u, selected: !allSelected })));
  };

  const saveAll = async () => {
    setSaving(true);
    try {
      const selectedGuests = unmatched.filter(u => u.selected);

      const res = await supabase.functions.invoke("bulk-add-attendees", {
        body: {
          event_id: eventId,
          matched_ids: matched.map(m => m.profileId),
          guests: selectedGuests.map(g => ({ first_name: g.firstName, last_name: g.lastName })),
        },
      });

      if (res.error) throw new Error(res.error.message || "Fout bij opslaan");
      if (res.data?.error) throw new Error(res.data.error);

      const added = Number(res.data?.added ?? 0);
      const failed = Array.isArray(res.data?.failed) ? res.data.failed : [];

      if (added > 0) {
        toast.success(`${added} deelnemer${added !== 1 ? "s" : ""} toegevoegd`);
      }
      if (failed.length > 0) {
        toast.error(`${failed.length} naam/namen konden niet als gast-lid worden aangemaakt`);
      }
      if (added === 0 && failed.length === 0) {
        toast.error("Er zijn geen deelnemers toegevoegd");
      }
      reset();
      setOpen(false);
      onDone();
    } catch (err: any) {
      toast.error(err.message || "Fout bij opslaan");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <ClipboardPaste size={14} className="mr-1" />Plak namenlijst
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display">Namenlijst importeren</DialogTitle>
        </DialogHeader>

        {step === "paste" && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Plak hier een lijst met namen (één per regel)</Label>
              <Textarea
                value={pasteText}
                onChange={e => setPasteText(e.target.value)}
                rows={10}
                placeholder={"Jan Jansen\nPiet de Vries\nMaria van den Berg"}
              />
            </div>
            <Button onClick={processNames} disabled={!pasteText.trim() || processing} className="w-full">
              {processing ? <><Loader2 size={14} className="mr-1 animate-spin" />Verwerken...</> : "Vergelijken met leden"}
            </Button>
          </div>
        )}

        {step === "results" && (
          <div className="space-y-4">
            {/* Matched */}
            {matched.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sm font-semibold flex items-center gap-1">
                  <Check size={14} className="text-green-600" />
                  Gevonden ({matched.length})
                </h3>
                <div className="border rounded-md divide-y max-h-40 overflow-y-auto">
                  {matched.map(m => (
                    <div key={m.profileId} className="px-3 py-2 text-sm flex justify-between">
                      <span className="font-medium">{m.profileName}</span>
                      {m.company && <span className="text-muted-foreground text-xs">{m.company}</span>}
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  Deze leden worden automatisch toegevoegd.
                </p>
              </div>
            )}

            {/* Unmatched */}
            {unmatched.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-destructive">
                    Niet gevonden ({unmatched.length})
                  </h3>
                  <Button size="sm" variant="ghost" onClick={selectAllUnmatched} className="text-xs h-7">
                    {unmatched.every(u => u.selected) ? "Deselecteer alles" : "Selecteer alles"}
                  </Button>
                </div>
                <div className="border rounded-md divide-y max-h-48 overflow-y-auto">
                  {unmatched.map((u, idx) => (
                    <label key={idx} className="flex items-center gap-3 px-3 py-2 text-sm cursor-pointer hover:bg-muted/50">
                      <Checkbox
                        checked={u.selected}
                        onCheckedChange={() => toggleUnmatched(idx)}
                      />
                      <div className="flex-1">
                        <span className="font-medium">{u.raw}</span>
                        <span className="text-muted-foreground text-xs ml-2">→ {u.firstName} {u.lastName}</span>
                      </div>
                    </label>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <UserPlus size={12} />
                  Geselecteerde namen worden als gast-lid aangemaakt en direct aan dit event gekoppeld.
                </p>
              </div>
            )}

            {matched.length === 0 && unmatched.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">
                Alle namen zijn al toegevoegd aan dit event.
              </p>
            )}

            <div className="flex gap-2">
              <Button variant="outline" onClick={() => { setStep("paste"); }} className="flex-1">Terug</Button>
              <Button
                onClick={saveAll}
                disabled={saving || (matched.length === 0 && !unmatched.some(u => u.selected))}
                className="flex-1"
              >
                {saving ? <><Loader2 size={14} className="mr-1 animate-spin" />Opslaan...</> : `Toevoegen (${matched.length + unmatched.filter(u => u.selected).length})`}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
