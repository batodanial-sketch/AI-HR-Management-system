import { Badge } from "@/components/ui/badge";

/** Maps a domain status string to a badge variant (shared across modules). */
const POSITIVE = new Set([
  "active", "completed", "approved", "present", "paid", "advance", "available",
  "assigned", "vested", "published", "on_track", "closed",
]);
const NEGATIVE = new Set([
  "rejected", "absent", "lost", "cancelled", "at_risk", "overdue", "retired", "expired",
]);
const WARNING = new Set([
  "pending", "late", "maintenance", "in_progress", "submitted", "draft", "hold",
  "planned", "calibration", "not_started", "enrolled", "assigned",
]);

export function StatusChip({ value }: { value: string }) {
  const variant = POSITIVE.has(value)
    ? "success"
    : NEGATIVE.has(value)
      ? "destructive"
      : WARNING.has(value)
        ? "warning"
        : "secondary";
  return (
    <Badge variant={variant} className="capitalize">
      {value.replace(/_/g, " ")}
    </Badge>
  );
}
