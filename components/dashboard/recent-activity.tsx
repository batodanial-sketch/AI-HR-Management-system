"use client";

import {
  CalendarClock,
  UserPlus,
  Users,
  Wallet,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate } from "@/lib/utils";
import type { ActivityEvent } from "@/lib/types";

const KIND_ICON: Record<ActivityEvent["kind"], LucideIcon> = {
  employee: UserPlus,
  candidate: Users,
  leave: CalendarClock,
  payroll: Wallet,
  workflow: Workflow,
};

const KIND_TINT: Record<ActivityEvent["kind"], string> = {
  employee: "bg-success/15 text-success",
  candidate: "bg-accent text-accent-foreground",
  leave: "bg-warning/15 text-warning",
  payroll: "bg-primary/15 text-primary",
  workflow: "bg-muted text-muted-foreground",
};

export function RecentActivity({ events }: { events: ActivityEvent[] }) {
  return (
    <Card className="glass" data-testid="dashboard-recent-activity">
      <CardHeader>
        <CardTitle className="text-sm font-semibold">Recent activity</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {events.map((event) => {
          const Icon = KIND_ICON[event.kind];
          return (
            <div key={event.id} className="flex items-start gap-3">
              <div
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${KIND_TINT[event.kind]}`}
              >
                <Icon className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm leading-snug">
                  <span className="font-medium">{event.actor}</span>{" "}
                  <span className="text-muted-foreground">{event.action}</span>{" "}
                  <span className="font-medium">{event.target}</span>
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {formatDate(event.timestamp)}
                </p>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
