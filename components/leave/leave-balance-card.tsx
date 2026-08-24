"use client";

import { motion } from "framer-motion";
import { CalendarClock, HeartPulse } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import type { LeaveBalance } from "@/lib/types";

const TYPE_META: Record<
  LeaveBalance["type"],
  { label: string; icon: typeof CalendarClock; tint: string }
> = {
  pto: { label: "Paid Time Off", icon: CalendarClock, tint: "bg-primary" },
  sick: { label: "Sick Leave", icon: HeartPulse, tint: "bg-success" },
};

/**
 * Leave balance progress card. Exposes the balance as `data-value` (remaining
 * days) so the E2E suite can assert the exact figure.
 */
export function LeaveBalanceCard({
  balance,
  index,
}: {
  balance: LeaveBalance;
  index: number;
}) {
  const meta = TYPE_META[balance.type];
  const Icon = meta.icon;
  const total = balance.balanceDays + balance.usedDays;
  const usedPercent = total > 0 ? Math.round((balance.usedDays / total) * 100) : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.06 }}
      className="glass rounded-xl p-5"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div
            className={cn(
              "flex h-9 w-9 items-center justify-center rounded-lg text-white",
              meta.tint,
            )}
          >
            <Icon className="h-4.5 w-4.5 h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-semibold">{meta.label}</p>
            <p className="text-xs text-muted-foreground">
              {balance.usedDays} of {total} days used
            </p>
          </div>
        </div>
        <div className="text-right">
          <p
            data-testid={`leave-balance-${balance.type}`}
            data-value={balance.balanceDays}
            className="text-2xl font-bold tabular-nums"
          >
            {balance.balanceDays}
          </p>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
            days left
          </p>
        </div>
      </div>
      <Progress value={usedPercent} className="mt-4" indicatorClassName={meta.tint} />
    </motion.div>
  );
}
