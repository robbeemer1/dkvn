import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, ArrowRightLeft, CheckCircle, Eye, Play, RefreshCw, RotateCcw, ShieldCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import ConfirmDialog from "@/components/ConfirmDialog";

interface DuplicatePair {
  memberA: { id: string; name: string };
  memberB: { id: string; name: string };
  rounds: string[];
  historicalMeetings: number;
}

interface SwapAlternative {
  toTable: { id: string; name: string };
  swapWith: { id: string; name: string } | null;
  toSeatId: string | null;
  cost: number;
  reason: string;
}

interface SwapSuggestion {
  roundId: string;
  roundLabel: string;
  movePerson: { id: string; name: string };
  fromTable: { id: string; name: string };
  toTable: { id: string; name: string };
  swapWith: { id: string; name: string } | null;
  fromSeatId: string;
  toSeatId: string | null;
  reason: string;
  alternatives: SwapAlternative[];
  currentAltIndex: number; // 0 = best, 1 = second best, etc.
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
  const [suggestions, setSuggestions] = useState<SwapSuggestion[]>([]);
  const [executing, setExecuting] = useState(false);
  const [viewingVersion, setViewingVersion] = useState<any | null>(null);
  const [restoreConfirm, setRestoreConfirm] = useState<any | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<any | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [restoring, setRestoring] = useState(false);

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

  const pairKey = (a: string, b: string) => a < b ? `${a}|${b}` : `${b}|${a}`;

  const handleCheckAndSave = async () => {
    setChecking(true);
    setSuggestions([]);
    try {
      // 1. Fetch meeting history
      const allMemberIds = registrations.map(r => r.member_id);
      const { data: history } = await supabase
        .from("meeting_history")
        .select("member_a_id, member_b_id, event_id")
        .or(allMemberIds.map(id => `member_a_id.eq.${id},member_b_id.eq.${id}`).join(","));

      // Build historical meeting count map (exclude current event)
      const historicalCounts: Record<string, number> = {};
      for (const h of history || []) {
        if (h.event_id === eventId) continue;
        const key = pairKey(h.member_a_id, h.member_b_id);
        historicalCounts[key] = (historicalCounts[key] || 0) + 1;
      }

      // 2. Find duplicates across rounds in current event
      const pairRounds: Record<string, { roundIds: string[]; roundLabels: string[] }> = {};
      for (const round of rounds) {
        const roundLabel = round.name || `Ronde ${round.round_number}`;
        for (const table of round.event_tables || []) {
          const memberIds = (table.table_seats || [])
            .filter((s: any) => s.member_id)
            .map((s: any) => s.member_id)
            .sort();
          for (let i = 0; i < memberIds.length; i++) {
            for (let j = i + 1; j < memberIds.length; j++) {
              const key = pairKey(memberIds[i], memberIds[j]);
              if (!pairRounds[key]) pairRounds[key] = { roundIds: [], roundLabels: [] };
              if (!pairRounds[key].roundIds.includes(round.id)) {
                pairRounds[key].roundIds.push(round.id);
                pairRounds[key].roundLabels.push(roundLabel);
              }
            }
          }
        }
      }

      const duplicatePairs: DuplicatePair[] = [];
      for (const [key, info] of Object.entries(pairRounds)) {
        if (info.roundIds.length > 1) {
          const [aId, bId] = key.split("|");
          duplicatePairs.push({
            memberA: { id: aId, name: getPersonName(aId, null) },
            memberB: { id: bId, name: getPersonName(bId, null) },
            rounds: info.roundLabels,
            historicalMeetings: historicalCounts[key] || 0,
          });
        }
      }

      setDuplicates(duplicatePairs);

      // 3. Generate swap suggestions for each duplicate
      if (duplicatePairs.length > 0) {
        const swapSuggestions = computeSwapSuggestions(duplicatePairs, pairRounds, historicalCounts);
        setSuggestions(swapSuggestions);
      }

      // 4. Save version
      const snapshot = buildSnapshot();
      const hasTables = rounds.some(r => (r.event_tables || []).length > 0);
      if (!hasTables) {
        toast.info("Geen tafels om op te slaan als versie.");
        setChecking(false);
        return;
      }

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
              const key = pairKey(memberIds[i], memberIds[j]);
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

      const nextVersion = seatingVersions.length > 0
        ? Math.max(...seatingVersions.map(v => v.version_number)) + 1
        : 1;

      const { error } = await supabase.from("seating_versions").insert({
        event_id: eventId,
        version_number: nextVersion,
        status: "concept",
        score,
        score_details: { new_meetings: totalNew, repeats: totalRepeats, total_pairs: totalPairs, duplicates_across_rounds: duplicatePairs.length },
        snapshot,
      });

      if (error) throw error;

      if (duplicatePairs.length === 0) {
        toast.success(`Versie ${nextVersion} opgeslagen — geen dubbele ontmoetingen gevonden! 🎉`);
      } else {
        toast.warning(`Versie ${nextVersion} opgeslagen — ${duplicatePairs.length} dubbele ontmoeting(en) gevonden.`);
      }

      onRefresh();
    } catch (err: any) {
      toast.error(err.message || "Fout bij controleren");
    }
    setChecking(false);
  };

  const computeSwapSuggestions = (
    duplicatePairs: DuplicatePair[],
    pairRounds: Record<string, { roundIds: string[]; roundLabels: string[] }>,
    historicalCounts: Record<string, number>,
  ): SwapSuggestion[] => {
    const suggestions: SwapSuggestion[] = [];
    const alreadyMoved = new Set<string>(); // track "roundId|memberId" to avoid double-moving

    for (const dup of duplicatePairs) {
      const key = pairKey(dup.memberA.id, dup.memberB.id);
      const info = pairRounds[key];
      if (!info || info.roundIds.length < 2) continue;

      // Keep them together in the first round, fix in subsequent rounds
      for (let ri = 1; ri < info.roundIds.length; ri++) {
        const roundId = info.roundIds[ri];
        const roundLabel = info.roundLabels[ri];
        const round = rounds.find(r => r.id === roundId);
        if (!round) continue;

        // Find which table each person is at in this round
        let tableA: any = null, tableB: any = null;
        let seatA: any = null, seatB: any = null;
        for (const table of round.event_tables || []) {
          for (const seat of table.table_seats || []) {
            if (seat.member_id === dup.memberA.id) { tableA = table; seatA = seat; }
            if (seat.member_id === dup.memberB.id) { tableB = table; seatB = seat; }
          }
        }
        if (!tableA || !tableB || tableA.id === tableB.id === false) continue;
        if (tableA.id !== tableB.id) continue; // they should be at the same table

        // Decide who to move: prefer moving the one who is NOT a host
        const isAHost = tableA.host_member_id === dup.memberA.id;
        const isBHost = tableA.host_member_id === dup.memberB.id;
        const moveKey1 = `${roundId}|${dup.memberA.id}`;
        const moveKey2 = `${roundId}|${dup.memberB.id}`;

        let movePerson: { id: string; name: string };
        let stayPerson: { id: string; name: string };
        let moveSeat: any;

        if (isAHost || alreadyMoved.has(moveKey1)) {
          movePerson = dup.memberB;
          stayPerson = dup.memberA;
          moveSeat = seatB;
        } else if (isBHost || alreadyMoved.has(moveKey2)) {
          movePerson = dup.memberA;
          stayPerson = dup.memberB;
          moveSeat = seatA;
        } else {
          // Move the one with more historical meetings at this table
          const aMeetings = (tableA.table_seats || [])
            .filter((s: any) => s.member_id && s.member_id !== dup.memberA.id)
            .reduce((sum: number, s: any) => sum + (historicalCounts[pairKey(dup.memberA.id, s.member_id)] || 0), 0);
          const bMeetings = (tableA.table_seats || [])
            .filter((s: any) => s.member_id && s.member_id !== dup.memberB.id)
            .reduce((sum: number, s: any) => sum + (historicalCounts[pairKey(dup.memberB.id, s.member_id)] || 0), 0);
          if (aMeetings >= bMeetings) {
            movePerson = dup.memberA; stayPerson = dup.memberB; moveSeat = seatA;
          } else {
            movePerson = dup.memberB; stayPerson = dup.memberA; moveSeat = seatB;
          }
        }

          // Collect ALL swap options, not just the best
          const allOptions: { table: any; swapSeat: any; cost: number }[] = [];

          for (const targetTable of round.event_tables || []) {
            if (targetTable.id === tableA.id) continue;

            const targetMembers = (targetTable.table_seats || [])
              .filter((s: any) => s.member_id)
              .map((s: any) => s.member_id);

            let moveCost = 0;
            for (const tm of targetMembers) {
              moveCost += historicalCounts[pairKey(movePerson.id, tm)] || 0;
              const pk = pairKey(movePerson.id, tm);
              if (pairRounds[pk] && pairRounds[pk].roundIds.some(rid => rid !== roundId)) {
                moveCost += 5;
              }
            }

            const swapCandidates = (targetTable.table_seats || [])
              .filter((s: any) => s.member_id && s.member_id !== targetTable.host_member_id && !alreadyMoved.has(`${roundId}|${s.member_id}`));

            for (const swapSeat of swapCandidates) {
              const origMembers = (tableA.table_seats || [])
                .filter((s: any) => s.member_id && s.member_id !== movePerson.id)
                .map((s: any) => s.member_id);
              let swapCost = 0;
              for (const om of origMembers) {
                swapCost += historicalCounts[pairKey(swapSeat.member_id, om)] || 0;
                const spk = pairKey(swapSeat.member_id, om);
                if (pairRounds[spk] && pairRounds[spk].roundIds.some(rid => rid !== roundId)) {
                  swapCost += 5;
                }
              }
              allOptions.push({ table: targetTable, swapSeat, cost: moveCost + swapCost });
            }
          }

          // Sort by cost ascending
          allOptions.sort((a, b) => a.cost - b.cost);

          if (allOptions.length === 0) continue;

          const buildReason = (opt: { table: any; swapSeat: any; cost: number }) => {
            const targetTableName = opt.table.table_name || `Tafel ${opt.table.table_number}`;
            const warningParts: string[] = [];
            const targetMembersForCheck = (opt.table.table_seats || [])
              .filter((s: any) => s.member_id && s.member_id !== opt.swapSeat.member_id)
              .map((s: any) => s.member_id);
            for (const tm of targetMembersForCheck) {
              const hc = historicalCounts[pairKey(movePerson.id, tm)] || 0;
              if (hc > 0) warningParts.push(`${movePerson.name} ontmoette ${getPersonName(tm, null)} al ${hc}×`);
            }
            const origMembersForCheck = (tableA.table_seats || [])
              .filter((s: any) => s.member_id && s.member_id !== movePerson.id)
              .map((s: any) => s.member_id);
            for (const om of origMembersForCheck) {
              const hc = historicalCounts[pairKey(opt.swapSeat.member_id, om)] || 0;
              if (hc > 0) warningParts.push(`${getPersonName(opt.swapSeat.member_id, null)} ontmoette ${getPersonName(om, null)} al ${hc}×`);
            }
            const reasonBase = dup.historicalMeetings > 0 ? `${dup.historicalMeetings}× eerder ontmoet. ` : "";
            const warningText = warningParts.length > 0 ? ` Let op: ${warningParts.join("; ")}.` : " Geen nieuwe dubbelen door deze wissel.";
            return `${reasonBase}Minste overlap bij ${targetTableName}.${warningText}`;
          };

          const best = allOptions[0];
          alreadyMoved.add(`${roundId}|${movePerson.id}`);
          alreadyMoved.add(`${roundId}|${best.swapSeat.member_id}`);

          const alternatives: SwapAlternative[] = allOptions.map(opt => ({
            toTable: { id: opt.table.id, name: opt.table.table_name || `Tafel ${opt.table.table_number}` },
            swapWith: { id: opt.swapSeat.member_id, name: getPersonName(opt.swapSeat.member_id, null) },
            toSeatId: opt.swapSeat.id,
            cost: opt.cost,
            reason: buildReason(opt),
          }));

          suggestions.push({
            roundId,
            roundLabel,
            movePerson,
            fromTable: { id: tableA.id, name: tableA.table_name || `Tafel ${tableA.table_number}` },
            toTable: alternatives[0].toTable,
            swapWith: alternatives[0].swapWith,
            fromSeatId: moveSeat.id,
            toSeatId: alternatives[0].toSeatId,
            reason: alternatives[0].reason,
            alternatives,
            currentAltIndex: 0,
          });
        }
      }

      return suggestions;
    };

  const executeSuggestions = async () => {
    setExecuting(true);
    try {
      // Execute each swap: update member_id on both seats
      for (const s of suggestions) {
        if (s.toSeatId && s.swapWith) {
          // Swap: movePerson goes to toSeatId, swapWith goes to fromSeatId
          const { error: e1 } = await supabase.from("table_seats").update({ member_id: s.movePerson.id }).eq("id", s.toSeatId);
          const { error: e2 } = await supabase.from("table_seats").update({ member_id: s.swapWith.id }).eq("id", s.fromSeatId);
          if (e1) throw e1;
          if (e2) throw e2;
        }
      }
      toast.success(`${suggestions.length} wissel(s) uitgevoerd!`);
      setDuplicates(null);
      setSuggestions([]);
      onRefresh();
    } catch (err: any) {
      toast.error(err.message || "Fout bij uitvoeren");
    }
    setExecuting(false);
  };

  const buildSnapshot = () => ({
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
  });

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

  const cycleAlternative = (index: number) => {
    setSuggestions(prev => prev.map((s, i) => {
      if (i !== index) return s;
      const nextIdx = (s.currentAltIndex + 1) % s.alternatives.length;
      const alt = s.alternatives[nextIdx];
      return {
        ...s,
        currentAltIndex: nextIdx,
        toTable: alt.toTable,
        swapWith: alt.swapWith,
        toSeatId: alt.toSeatId,
        reason: alt.reason,
      };
    }));
  };

  const deleteVersion = async (version: any) => {
    setDeleting(true);
    try {
      const { error } = await supabase.from("seating_versions").delete().eq("id", version.id);
      if (error) throw error;
      toast.success(`Versie ${version.version_number} verwijderd.`);
      onRefresh();
    } catch (err: any) {
      toast.error(err.message || "Fout bij verwijderen");
    }
    setDeleting(false);
    setDeleteConfirm(null);
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

      {/* Duplicate results + suggestions */}
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
            <CardContent className="pt-0 space-y-4">
              {/* Duplicate list */}
              <div className="space-y-1.5">
                {duplicates.map((dup, i) => (
                  <div key={i} className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-medium">{dup.memberA.name}</span>
                    <span className="text-muted-foreground">&</span>
                    <span className="font-medium">{dup.memberB.name}</span>
                    {dup.historicalMeetings > 0 && (
                      <Badge variant="outline" className="text-xs text-amber-700 border-amber-300">
                        {dup.historicalMeetings}× eerder ontmoet
                      </Badge>
                    )}
                    <span className="text-muted-foreground">→</span>
                    <div className="flex gap-1">
                      {dup.rounds.map((r, j) => (
                        <Badge key={j} variant="secondary" className="text-xs">{r}</Badge>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {/* Swap suggestions */}
              {suggestions.length > 0 && (
                <div className="border-t pt-3 space-y-3">
                  <h4 className="text-sm font-semibold flex items-center gap-2">
                    <ArrowRightLeft size={14} />
                    Voorgestelde wissels
                  </h4>
                  <div className="space-y-2">
                    {suggestions.map((s, i) => (
                      <div key={i} className="flex flex-col gap-1 p-2 rounded-md bg-background border">
                        <div className="flex flex-wrap items-center gap-2 text-sm">
                          <Badge variant="secondary" className="text-xs">{s.roundLabel}</Badge>
                          <span className="font-medium">{s.movePerson.name}</span>
                          <span className="text-muted-foreground">{s.fromTable.name} →</span>
                          <span className="font-medium">{s.toTable.name}</span>
                          {s.swapWith && (
                            <>
                              <span className="text-muted-foreground">↔</span>
                              <span className="font-medium">{s.swapWith.name}</span>
                            </>
                          )}
                          {s.alternatives.length > 1 && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 px-2 text-xs ml-auto"
                              onClick={() => cycleAlternative(i)}
                            >
                              <RefreshCw size={12} className="mr-1" />
                              Alternatief ({s.currentAltIndex + 1}/{s.alternatives.length})
                            </Button>
                          )}
                        </div>
                        <span className="text-xs text-muted-foreground">{s.reason}</span>
                      </div>
                    ))}
                  </div>
                  <Button
                    size="sm"
                    onClick={executeSuggestions}
                    disabled={executing}
                    className="w-full sm:w-auto"
                  >
                    <Play size={14} className="mr-1" />
                    {executing ? "Uitvoeren..." : `Alle ${suggestions.length} wissel(s) uitvoeren`}
                  </Button>
                </div>
              )}
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
                      <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setViewingVersion(v)}>
                        <Eye size={13} className="mr-1" />Bekijk
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setRestoreConfirm(v)}>
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
