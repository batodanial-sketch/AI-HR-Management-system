"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, CheckCircle2, Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { requestLeave } from "@/lib/actions";
import type { LeaveType } from "@/lib/types";

const LEAVE_TYPES: Array<{ value: LeaveType; label: string }> = [
  { value: "pto", label: "Paid Time Off" },
  { value: "sick", label: "Sick Leave" },
  { value: "unpaid", label: "Unpaid Leave" },
];

/**
 * Leave request form (PTO / sick / unpaid). Submits through the `requestLeave`
 * server action and surfaces a typed success state on completion.
 */
export function LeaveRequestForm() {
  const router = useRouter();
  const [type, setType] = React.useState<LeaveType>("pto");
  const [startDate, setStartDate] = React.useState("");
  const [endDate, setEndDate] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [submitted, setSubmitted] = React.useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (!startDate || !endDate) {
      setError("Start and end dates are required.");
      return;
    }
    if (new Date(endDate) < new Date(startDate)) {
      setError("End date must be after the start date.");
      return;
    }

    setSubmitting(true);
    try {
      await requestLeave({ type, startDate, endDate, reason });
      setSubmitted(true);
      setStartDate("");
      setEndDate("");
      setReason("");
      router.refresh();
      window.setTimeout(() => setSubmitted(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form
      data-testid="leave-pto-form"
      onSubmit={handleSubmit}
      className="glass space-y-4 rounded-xl p-5"
    >
      <div className="flex items-center gap-2">
        <CalendarClock className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold">Request leave</h3>
      </div>

      <div className="space-y-2">
        <Label htmlFor="leave-type">Leave type</Label>
        <Select
          value={type}
          onValueChange={(value) => setType(value as LeaveType)}
        >
          <SelectTrigger id="leave-type" data-testid="leave-type-select" data-type={type}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {LEAVE_TYPES.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="start-date">Start date</Label>
          <Input
            id="start-date"
            type="date"
            data-testid="leave-start-date"
            value={startDate}
            onChange={(event) => setStartDate(event.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="end-date">End date</Label>
          <Input
            id="end-date"
            type="date"
            data-testid="leave-end-date"
            value={endDate}
            onChange={(event) => setEndDate(event.target.value)}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="reason">Reason</Label>
        <Textarea
          id="reason"
          data-testid="leave-reason-input"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="Optional note for your manager…"
        />
      </div>

      {error && (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      {submitted && (
        <p className="flex items-center gap-2 rounded-md border border-success/30 bg-success/10 px-3 py-2 text-sm text-success">
          <CheckCircle2 className="h-4 w-4" /> Request submitted for approval.
        </p>
      )}

      <Button
        type="submit"
        data-testid="leave-submit-button"
        className="w-full"
        disabled={submitting}
      >
        {submitting ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Send className="h-4 w-4" />
        )}
        Submit request
      </Button>
    </form>
  );
}
