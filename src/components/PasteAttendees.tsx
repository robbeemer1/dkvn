import { useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ClipboardPaste, Check, UserPlus, Loader2, Link2, X } from "lucide-react";
import { toast } from "sonner";
import SearchableSelect from "@/components/SearchableSelect";

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

interface ProfileOption {
  id: string;
  first_name: string;
  last_name: string;
  company_name: string | null;
}

interface UnmatchedEntry {
  raw: string;
  firstName: string;
  lastName: string;
  /** If set, this entry is manually linked to an existing profile */
  linkedProfileId: string | null;
  /** If true and not linked, create as new guest */
  createAsGuest: boolean;
}

export default function PasteAttendees({ eventId, existingMemberIds, onDone }: PasteAttendeesProps) {
  const [open, setOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [step, setStep] = useState<"paste" | "results">("paste");
  const [matched, setMatched] = useState<MatchResult[]>([]);
  const [unmatched, setUnmatched] = useState<UnmatchedEntry[]>([]);
  const [allProfiles, setAllProfiles] = useState<ProfileOption[]>([]);
  const [processing, setProcessing] = useState(false);
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setPasteText("");
    setStep("paste");
    setMatched([]);
    setUnmatched([]);
    setAllProfiles([]);
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

    const fetchedProfiles = profiles || [];
    setAllProfiles(fetchedProfiles);

    const matchedList: MatchResult[] = [];
    const unmatchedList: UnmatchedEntry[] = [];

    for (const line of lines) {
      const norm = normalize(line);
      const match = fetchedProfiles.find(p => normalize(`${p.first_name} ${p.last_name}`) === norm)
        || fetchedProfiles.find(p => normalize(p.last_name) === norm)
        || fetchedProfiles.find(p => {
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
        unmatchedList.push({
          raw: line,
          firstName: parts[0] || line,
          lastName: parts.slice(1).join(" ") || "",
          linkedProfileId: null,
          createAsGuest: false,
        });
      }
    }

    setMatched(matchedList);
    setUnmatched(unmatchedList);
    setStep("results");
    setProcessing(false);
  };

  // Build profile options for manual linking, excluding already-matched and already-registered members
  const profileOptions = useMemo(() => {
    const usedIds = new Set([
      ...existingMemberIds,
      ...matched.map(m => m.profileId),
      ...unmatched.filter(u => u.linkedProfileId).map(u => u.linkedProfileId!),
    ]);
    return allProfiles
      .filter(p => !usedIds.has(p.id))
      .map(p => ({
        value: p.id,
        label: `${p.first_name} ${p.last_name}${p.company_name ? ` (${p.company_name})` : ""}`,
      }));
  }, [allProfiles, existingMemberIds, matched, unmatched]);

  const linkProfile = (idx: number, profileId: string) => {
    setUnmatched(prev => prev.map((u, i) => i === idx ? { ...u, linkedProfileId: profileId || null, createAsGuest: false } : u));
  };

  const unlinkProfile = (idx: number) => {
    setUnmatched(prev => prev.map((u, i) => i === idx ? { ...u, linkedProfileId: null } : u));
  };

  const toggleCreateAsGuest = (idx: number) => {
    setUnmatched(prev => prev.map((u, i) => i === idx ? { ...u, createAsGuest: !u.createAsGuest, linkedProfileId: null } : u));
  };

  const selectAllAsGuest = () => {
    const unlinked = unmatched.filter(u => !u.linkedProfileId);
    const allSelected = unlinked.length > 0 && unlinked.every(u => u.createAsGuest);
    setUnmatched(prev => prev.map(u => u.linkedProfileId ? u : { ...u, createAsGuest: !allSelected }));
  };

  const totalToAdd = matched.length
    + unmatched.filter(u => u.linkedProfileId).length
    + unmatched.filter(u => !u.linkedProfileId && u.createAsGuest).length;

  const saveAll = async () => {
    setSaving(true);
    try {
      const manuallyLinkedIds = unmatched.filter(u => u.linkedProfileId).map(u => u.linkedProfileId!);
      const guestsToCreate = unmatched.filter(u => !u.linkedProfileId && u.createAsGuest);

      const res = await supabase.functions.invoke("bulk-add-attendees", {
        body: {
          event_id: eventId,
          matched_ids: [...matched.map(m => m.profileId), ...manuallyLinkedIds],
          guests: guestsToCreate.map(g => ({ first_name: g.firstName, last_name: g.lastName })),
        },
      });

      if (res.error) throw new Error(res.error.message || "Fout bij opslaan");
      if (res.data?.error) throw new Error(res.data.error);

      const added = Number(res.data?.added ?? 0);
      const failed = Array.isArray(res.data?.failed) ? res.data.failed : [];

      if (added > 0) toast.success(`${added} deelnemer${added !== 1 ? "s" : ""} toegevoegd`);
      if (failed.length > 0) toast.error(`${failed.length} naam/namen konden niet worden aangemaakt`);
      if (added === 0 && failed.length === 0) toast.error("Er zijn geen deelnemers toegevoegd");

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
                  <Button size="sm" variant="ghost" onClick={selectAllAsGuest} className="text-xs h-7">
                    {unmatched.filter(u => !u.linkedProfileId).every(u => u.createAsGuest) ? "Deselecteer alles" : "Allen als gast aanmaken"}
                  </Button>
                </div>
                <div className="border rounded-md divide-y max-h-[280px] overflow-y-auto">
                  {unmatched.map((u, idx) => (
                    <div key={idx} className="px-3 py-2.5 space-y-1.5">
                      <div className="text-sm font-medium">{u.raw}</div>
                      {u.linkedProfileId ? (
                        <div className="flex items-center gap-1.5">
                          <Link2 size={12} className="text-green-600 shrink-0" />
                          <span className="text-xs text-green-700 flex-1 truncate">
                            Gekoppeld aan: {allProfiles.find(p => p.id === u.linkedProfileId)
                              ? `${allProfiles.find(p => p.id === u.linkedProfileId)!.first_name} ${allProfiles.find(p => p.id === u.linkedProfileId)!.last_name}`
                              : u.linkedProfileId}
                          </span>
                          <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => unlinkProfile(idx)}>
                            <X size={12} />
                          </Button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <div className="flex-1 min-w-0">
                            <SearchableSelect
                              options={profileOptions}
                              value=""
                              onValueChange={(val) => linkProfile(idx, val)}
                              placeholder="Koppel aan bestaand lid..."
                              emptyText="Geen leden gevonden"
                            />
                          </div>
                          <label className="flex items-center gap-1.5 cursor-pointer shrink-0">
                            <Checkbox
                              checked={u.createAsGuest}
                              onCheckedChange={() => toggleCreateAsGuest(idx)}
                            />
                            <span className="text-xs text-muted-foreground whitespace-nowrap">Nieuw</span>
                          </label>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <UserPlus size={12} />
                  Koppel handmatig aan een bestaand lid, of vink "Nieuw" aan om als gast-lid aan te maken.
                </p>
              </div>
            )}

            {matched.length === 0 && unmatched.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">
                Alle namen zijn al toegevoegd aan dit event.
              </p>
            )}

            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep("paste")} className="flex-1">Terug</Button>
              <Button
                onClick={saveAll}
                disabled={saving || totalToAdd === 0}
                className="flex-1"
              >
                {saving ? <><Loader2 size={14} className="mr-1 animate-spin" />Opslaan...</> : `Toevoegen (${totalToAdd})`}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
