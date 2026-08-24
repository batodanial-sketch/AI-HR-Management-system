"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  CalendarDays,
  Mail,
  MapPin,
  UserRoundX,
} from "lucide-react";
import { setEmploymentStatus } from "@/lib/actions";
import { useUser } from "@/components/providers";
import { NameAvatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { formatDate } from "@/lib/utils";
import type { Employee } from "@/lib/types";
import { StatusBadge } from "./status-badge";

/**
 * Employee profile: header, meta detail grid, and an offboarding flow with a
 * confirmation dialog.
 */
export function ProfileView({ employee }: { employee: Employee }) {
  const router = useRouter();
  const user = useUser();
  const canManage = user.role === "owner" || user.role === "admin";
  const [offboardOpen, setOffboardOpen] = React.useState(false);
  const [confirming, setConfirming] = React.useState(false);

  const handleOffboard = async () => {
    setConfirming(true);
    await setEmploymentStatus(employee.id, "terminated");
    setConfirming(false);
    setOffboardOpen(false);
    router.refresh();
  };

  const fullName = `${employee.firstName} ${employee.lastName}`;

  return (
    <div className="space-y-6">
      <Link
        href="/employees"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back to directory
      </Link>

      <div data-testid="employee-profile" className="glass rounded-xl">
        <div className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <NameAvatar name={fullName} className="h-16 w-16 text-xl" />
            <div>
              <h1
                data-testid="employee-profile-name"
                className="text-2xl font-bold tracking-tight"
              >
                {fullName}
              </h1>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <Badge variant="secondary">{employee.title}</Badge>
                <div data-testid="employee-profile-status">
                  <StatusBadge status={employee.employmentStatus} />
                </div>
              </div>
            </div>
          </div>
          {canManage && employee.employmentStatus !== "terminated" && (
            <Dialog open={offboardOpen} onOpenChange={setOffboardOpen}>
              <DialogTrigger asChild>
                <Button
                  variant="destructive"
                  data-testid="employee-offboard-button"
                >
                  <UserRoundX className="h-4 w-4" /> Offboard
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Offboard {fullName}?</DialogTitle>
                  <DialogDescription>
                    This will mark the employee as terminated, revoke their access
                    and trigger the offboarding workflow. This action is reversible
                    by an admin.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <Button variant="ghost" onClick={() => setOffboardOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    variant="destructive"
                    data-testid="employee-offboard-confirm"
                    onClick={handleOffboard}
                    disabled={confirming}
                  >
                    {confirming ? "Offboarding…" : "Confirm offboard"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>

        <Separator />

        <div className="grid grid-cols-1 gap-6 p-6 sm:grid-cols-2 lg:grid-cols-3">
          <DetailRow
            icon={<Mail className="h-4 w-4" />}
            label="Email"
            value={employee.email}
          />
          <DetailRow
            icon={<CalendarDays className="h-4 w-4" />}
            label="Start date"
            value={formatDate(employee.startDate)}
          />
          <DetailRow
            icon={<MapPin className="h-4 w-4" />}
            label="Location"
            value={employee.location}
          />
          <DetailRow label="Department" value={employee.department} />
          <DetailRow label="Role" value={employee.role} />
          <DetailRow label="Employee ID" value={employee.id} />
        </div>
      </div>
    </div>
  );
}

function DetailRow({
  icon,
  label,
  value,
}: {
  icon?: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="space-y-1">
      <p className="label-xs flex items-center gap-1.5">
        {icon}
        {label}
      </p>
      <p className="text-sm font-medium">{value}</p>
    </div>
  );
}
