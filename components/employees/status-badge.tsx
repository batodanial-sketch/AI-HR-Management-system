import { Badge } from "@/components/ui/badge";
import type { EmploymentStatus } from "@/lib/types";

const STATUS_CONFIG: Record<
  EmploymentStatus,
  { label: string; variant: "success" | "warning" | "destructive" }
> = {
  active: { label: "Active", variant: "success" },
  on_leave: { label: "On leave", variant: "warning" },
  terminated: { label: "Terminated", variant: "destructive" },
};

export function StatusBadge({ status }: { status: EmploymentStatus }) {
  const config = STATUS_CONFIG[status];
  return (
    <Badge variant={config.variant} data-status={status}>
      {config.label}
    </Badge>
  );
}
