"use client";

import Link from "next/link";
import {
  CalendarClock,
  FileText,
  UserPlus,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface QuickAction {
  label: string;
  href: string;
  icon: LucideIcon;
  tint: string;
}

const ACTIONS: QuickAction[] = [
  {
    label: "Add employee",
    href: "/employees/new",
    icon: UserPlus,
    tint: "bg-primary text-primary-foreground",
  },
  {
    label: "Request leave",
    href: "/leave",
    icon: CalendarClock,
    tint: "bg-accent text-accent-foreground",
  },
  {
    label: "Run payroll",
    href: "/payroll",
    icon: Wallet,
    tint: "bg-success/15 text-success",
  },
  {
    label: "New workflow",
    href: "/workflows/builder",
    icon: FileText,
    tint: "bg-warning/15 text-warning",
  },
];

export function QuickActions() {
  return (
    <Card className="glass" data-testid="dashboard-quick-actions">
      <CardHeader>
        <CardTitle className="text-sm font-semibold">Quick actions</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-2">
        {ACTIONS.map((action) => {
          const Icon = action.icon;
          return (
            <Link
              key={action.href}
              href={action.href}
              className="group flex flex-col items-center gap-2 rounded-lg border border-border/70 bg-card/40 p-3.5 text-center transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
            >
              <span
                className={`flex h-9 w-9 items-center justify-center rounded-lg transition-transform group-hover:scale-110 ${action.tint}`}
              >
                <Icon className="h-5 w-5" />
              </span>
              <span className="text-xs font-medium">{action.label}</span>
            </Link>
          );
        })}
      </CardContent>
    </Card>
  );
}
