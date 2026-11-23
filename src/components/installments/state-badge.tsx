import { Badge } from "@/components/ui/badge";
import { STATE_LABELS, STATE_TONES, type InstallmentState } from "@/lib/payments";

/** Statut d'une échéance : Prévu, À encaisser, Encaissé, Rejeté — ou « En retard » si la date est passée. */
export function StateBadge({ state, late, className }: { state: InstallmentState; late: boolean; className?: string }) {
  if (late) {
    return (
      <Badge tone="late" className={className}>
        En retard
      </Badge>
    );
  }
  return (
    <Badge tone={STATE_TONES[state]} className={className}>
      {STATE_LABELS[state]}
    </Badge>
  );
}
