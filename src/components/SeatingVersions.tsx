import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, CheckCircle, Eye, RotateCcw, Save, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import ConfirmDialog from "@/components/ConfirmDialog";

interface DuplicatePair {
  memberA: { id: string; name: string };
  memberB: { id: string; name: string };
  rounds: string[];
}

interface SeatingVersionsProps {
  eventId: string;
  rounds: any[];
  registrations: any[];
  guests: any[];
  seatingVersions: any[];
  onRefresh: () => void;
}

export default function SeatingVersions({
  eventId,
  rounds,
  registrations,
  guests,
  seatingVersions,
  onRefresh,
}: SeatingVersionsProps) {
  const [checking, setChecking] = useState(false);
  const [duplicates, setDuplicates] = useState<DuplicatePair[] | null>(null);
  const [viewingVersion, setViewingVersion] = useState<any | null>(null);
  const [restoreConfirm, setRestoreConfirm] = useState<any | null>(null);
  const [restoring, setRestoring] = useState(false);

  // Build a name lookup from registrations and guests
  const getPersonName = (memberId: string | null, guestId: string | null): string => {
    if (memberId) {
      const reg = registrations.find(r => r.member_id === memberId);
      if (reg?.profiles) return `${reg.profiles.first_name} ${reg.profiles.last_name}`.trim();
      return memberId.slice(0, 8);
    }
    if (guestId) {
      const guest = guests.find(g => g.id === guestId);
      if (guest) return `${guest.first_name} ${guest.last_name}`.trim();
      return `Gast ${guestId.slice(0, 8)}`;
    }
    return "Onbekend";
  };

  const checkDuplicates = (): DuplicatePair[] => {
    // For each round, build a map of which members sit together
    // Then find pairs that appear in multiple rounds
    const pairRounds: Record<string, Set<string>> = {};

    for (const round of rounds) {
      const roundLabel = round.name || `Ronde ${round.round_number}`;
      for (const table of round.event_tables || []) {
        const memberIds = (table.table_seats || [])
          .filter((s: any) => s.member_id)
          .map((s: any) => s.member_id)
          .sort();

        for (let i = 0; i < memberIds.length; i++) {
          for (let j = i + 1; j < memberIds.length; j++) {
            const key = `${memberIds[i]}|${memberIds[j]}`;
            if (!pairRounds[key]) pairRounds[key] = new Set();
            pairRounds[key].add(roundLabel);
          }
        }
      }
    }

    // Filter pairs that appear in more than one round
    const duplicatePairs: DuplicatePair[] = [];
    for (const [key, roundSet] of Object.entries(pairRounds)) {
      if (roundSet.size > 1) {
        const [aId, bId] = key.split("|");
        duplicatePairs.push({
          memberA: { id: aId, name: getPersonName(aId, null) },
          memberB: { id: bId, name: getPersonName(bId, null) },
          rounds: Array.from(roundSet),
        });
      }
    }

    return duplicatePairs;
  };

  const buildSnapshot = () => {
    return {
      rounds: rounds.map(round => ({
        round_number: round.round_number,
        name: round.name,
        tables: (round.event_tables || []).map((table: any) => ({
          table_number: table.table_number,
          table_name: table.table_name,
          capacity: table.capacity,
          host_member_id: table.host_member_id,
          seats: (table.table_seats || []).map((seat: any) => ({
            member_id: seat.member_id,
            guest_id: seat.guest_id,
            seat_number: seat.seat_number,
          })),
        })),
      })),
    };
  };

  const handleCheckAndSave = async () => {
    setChecking(true);
    try {
      // 1. Check duplicates
      const dups = checkDuplicates();
      setDuplicates(dups);

      // 2. Save current state as version
      const snapshot = buildSnapshot();

      // Only save if there are actual tables
      const hasTables = rounds.some(r => (r.event_tables || []).length > 0);
      if (!hasTables) {
        toast.info("Geen tafels om op te slaan als versie.");
        setChecking(false);
        return;
      }

      // Calculate score
      let totalNew = 0;
      let totalRepeats = 0;
      const pairCounts: Record<string, number> = {};
      for (const round of rounds) {
        for (const table of round.event_tables || []) {
          const memberIds = (table.table_seats || [])
            .filter((s: any) => s.member_id)
            .map((s: any) => s.member_id)
            .sort();
          for (let i = 0; i < memberIds.length; i++) {
            for (let j = i + 1; j < memberIds.length; j++) {
              const key = `${memberIds[i]}|${memberIds[j]}`;
              pairCounts[key] = (pairCounts[key] || 0) + 1;
            }
          }
        }
      }
      for (const count of Object.values(pairCounts)) {
        if (count <= 1) totalNew++;
        else totalRepeats += count - 1;
      }
      const totalPairs = totalNew + totalRepeats;
      const score = totalPairs > 0 ? Math.round((totalNew / totalPairs) * 100) : 100;

      // Get next version number
      const nextVersion = seatingVersions.length > 0
        ? Math.max(...seatingVersions.map(v => v.version_number)) + 1
        : 1;

      const { error } = await supabase.from("seating_versions").insert({
        event_id: eventId,
        version_number: nextVersion,
        status: "concept",
        score,
        score_details: { new_meetings: totalNew, repeats: totalRepeats, total_pairs: totalPairs, duplicates_across_rounds: dups.length },
        snapshot,
      });

      if (error) throw error;

      if (dups.length === 0) {
        toast.success(`Versie ${nextVersion} opgeslagen — geen dubbele ontmoetingen gevonden! 🎉`);
      } else {
        toast.warning(`Versie ${nextVersion} opgeslagen — ${dups.length} dubbele ontmoeting(en) gevonden.`);
      }

      onRefresh();
    } catch (err: any) {
      toast.error(err.message || "Fout bij controleren");
    }
    setChecking(false);
  };

  const restoreVersion = async (version: any) => {
    setRestoring(true);
    try {
      const res = await supabase.functions.invoke("restore-seating-version", {
        body: { version_id: version.id },
      });
      if (res.error) throw res.error;
      if (res.data?.error) throw new Error(res.data.error);
      toast.success(res.data?.message || `Versie ${version.version_number} hersteld.`);
      onRefresh();
    } catch (err: any) {
      toast.error(err.message || "Fout bij herstellen");
    }
    setRestoring(false);
    setRestoreConfirm(null);
  };

  const renderSnapshotPreview = (snapshot: any) => {
    if (!snapshot?.rounds) return <p className="text-muted-foreground text-sm">Geen snapshot data beschikbaar.</p>;

    return (
      <div className="space-y-4 max-h-[60vh] overflow-y-auto">
        {snapshot.rounds.map((round: any, ri: number) => (
          <div key={ri}>
            <h4 className="font-semibold text-sm mb-2">{round.name || `Ronde ${round.round_number}`}</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {(round.tables || []).map((table: any, ti: number) => (
                <div key={ti} className="border rounded-lg p-3 bg-muted/30">
                  <p className="font-medium text-xs mb-1">
                    {table.table_name || `Tafel ${table.table_number}`}
                    <span className="text-muted-foreground font-normal ml-1">({table.seats?.length || 0}/{table.capacity})</span>
                  </p>
                  <ul className="space-y-0.5">
                    {(table.seats || []).map((seat: any, si: number) => (
                      <li key={si} className="text-xs text-muted-foreground">
                        • {getPersonName(seat.member_id, seat.guest_id)}
                        {seat.member_id === table.host_member_id && " ★"}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <>
      {/* Check button */}
      <div className="flex gap-2 items-center">
        <Button
          size="sm"
          variant="outline"
          onClick={handleCheckAndSave}
          disabled={checking || rounds.length === 0}
        >
          <ShieldCheck size={14} className="mr-1" />
          {checking ? "Controleren..." : "Controleer & bewaar versie"}
        </Button>
      </div>

      {/* Duplicate results */}
      {duplicates !== null && (
        <Card className={cn(
          "border",
          duplicates.length === 0 ? "border-green-300 bg-green-50/50 dark:bg-green-950/20" : "border-amber-300 bg-amber-50/50 dark:bg-amber-950/20"
        )}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              {duplicates.length === 0 ? (
                <><CheckCircle size={16} className="text-green-600" />Geen dubbele ontmoetingen</>
              ) : (
                <><AlertTriangle size={16} className="text-amber-600" />{duplicates.length} dubbele ontmoeting(en) gevonden</>
              )}
            </CardTitle>
          </CardHeader>
          {duplicates.length > 0 && (
            <CardContent className="pt-0">
              <div className="space-y-1.5">
                {duplicates.map((dup, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <span className="font-medium">{dup.memberA.name}</span>
                    <span className="text-muted-foreground">&</span>
                    <span className="font-medium">{dup.memberB.name}</span>
                    <span className="text-muted-foreground">→</span>
                    <div className="flex gap-1">
                      {dup.rounds.map((r, j) => (
                        <Badge key={j} variant="secondary" className="text-xs">{r}</Badge>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          )}
        </Card>
      )}

      {/* Version history */}
      {seatingVersions.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-lg font-display">Versiegeschiedenis</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {seatingVersions.map(v => {
                const scoreDetails = v.score_details as any;
                return (
                  <div key={v.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-lg bg-muted/50">
                    <div>
                      <p className="font-medium text-sm">Versie {v.version_number}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(v.created_at).toLocaleString("nl-NL")}
                        {scoreDetails?.duplicates_across_rounds != null && (
                          <span className={cn("ml-2", scoreDetails.duplicates_across_rounds > 0 ? "text-amber-600" : "text-green-600")}>
                            · {scoreDetails.duplicates_across_rounds === 0 ? "✓ Geen dubbelen" : `⚠ ${scoreDetails.duplicates_across_rounds} dubbel(en)`}
                          </span>
                        )}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {v.score != null && <span className="text-sm font-medium text-primary">Score: {v.score}%</span>}
                      <span className={cn("text-xs px-2 py-1 rounded-full", v.status === "gepubliceerd" ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-muted text-muted-foreground")}>
                        {v.status}
                      </span>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-xs"
                        onClick={() => setViewingVersion(v)}
                      >
                        <Eye size={13} className="mr-1" />Bekijk
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-xs"
                        onClick={() => setRestoreConfirm(v)}
                      >
                        <RotateCcw size={13} className="mr-1" />Herstel
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* View version dialog */}
      <Dialog open={viewingVersion !== null} onOpenChange={open => { if (!open) setViewingVersion(null); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="font-display">
              Versie {viewingVersion?.version_number}
              {viewingVersion?.score != null && (
                <span className="ml-2 text-sm font-normal text-muted-foreground">Score: {viewingVersion.score}%</span>
              )}
            </DialogTitle>
          </DialogHeader>
          {viewingVersion && renderSnapshotPreview(viewingVersion.snapshot)}
        </DialogContent>
      </Dialog>

      {/* Restore confirmation */}
      <ConfirmDialog
        open={restoreConfirm !== null}
        onOpenChange={open => { if (!open) setRestoreConfirm(null); }}
        title="Versie herstellen"
        description={`Weet je zeker dat je versie ${restoreConfirm?.version_number} wilt herstellen? De huidige tafelindeling wordt overschreven. Eerdere en nieuwere versies blijven beschikbaar.`}
        onConfirm={() => restoreConfirm && restoreVersion(restoreConfirm)}
        confirmLabel={restoring ? "Herstellen..." : "Herstellen"}
        cancelLabel="Annuleren"
        variant="default"
      />
    </>
  );
}
