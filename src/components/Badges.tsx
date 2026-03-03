import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export function MembershipBadge({ level }: { level: string }) {
  const classes: Record<string, string> = {
    goud: "badge-goud",
    zilver: "badge-zilver",
    brons: "badge-brons",
    gastlid: "badge-gastlid",
  };
  return (
    <Badge variant="outline" className={cn("capitalize", classes[level] || "")}>
      {level}
    </Badge>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const labels: Record<string, string> = {
    aangemeld: "Aangemeld",
    bevestigd: "Bevestigd",
    aanwezig: "Aanwezig",
    afgemeld: "Afgemeld",
    no_show: "No-show",
  };
  return (
    <Badge variant="secondary" className={cn("text-xs", `status-${status}`)}>
      {labels[status] || status}
    </Badge>
  );
}

export function RegionBadge({ name }: { name: string }) {
  return (
    <Badge variant="outline" className="text-xs">
      {name}
    </Badge>
  );
}
