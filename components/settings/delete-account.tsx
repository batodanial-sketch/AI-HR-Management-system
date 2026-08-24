"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2 } from "lucide-react";
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

/**
 * Self-service account deletion. Erases the user's identity, profile and
 * membership, and anonymizes their linked employee record. Requires the user
 * to type the exact phrase as a confirmation guard against accidental clicks.
 */
export function DeleteAccount() {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [confirm, setConfirm] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const phrase = "DELETE";
  const ready = confirm === phrase;

  const handleDelete = async () => {
    if (!ready) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/account/delete", { method: "POST" });
      const data = (await response.json()) as { ok?: boolean; message?: string };
      if (!response.ok || !data.ok) {
        setError(data.message ?? "Account deletion failed.");
        setBusy(false);
        return;
      }
      // Identity erased — clear the (now-stale) session cookies and return to
      // the marketing surface.
      await fetch("/auth/sign-out", { method: "POST" });
      router.push("/");
      router.refresh();
    } catch {
      setError("Could not reach the deletion service.");
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="destructive" size="sm" data-testid="delete-account-btn">
          <Trash2 className="h-4 w-4" /> Delete my account
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete your account?</DialogTitle>
          <DialogDescription>
            This permanently erases your login, profile and workspace
            membership, and anonymizes any employee record linked to you. This
            cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            Type <span className="font-semibold text-foreground">DELETE</span>{" "}
            to confirm.
          </p>
          <input
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
            placeholder="DELETE"
            autoComplete="off"
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
          />
        </div>
        {error && (
          <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={() => void handleDelete()}
            disabled={!ready || busy}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            Permanently delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
