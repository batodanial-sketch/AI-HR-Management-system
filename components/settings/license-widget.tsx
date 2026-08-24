"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  BadgeCheck,
  CalendarClock,
  KeyRound,
  Loader2,
  ShieldCheck,
  Users,
} from "lucide-react";
import { WhatsAppIcon } from "@/components/ui/whatsapp-icon";
import { whatsappLink, WHATSAPP_MESSAGES, WHATSAPP_PHONE_DISPLAY } from "@/lib/whatsapp";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLicense } from "@/components/providers";
import {
  daysRemaining,
  maskLicenseKey,
  TIER_LABELS,
} from "@/lib/license-format";

const TIER_BADGE: Record<string, "warning" | "accent" | "success"> = {
  TRIAL: "warning",
  PRO: "accent",
  ENTERPRISE: "success",
};

/**
 * Instance & License panel — tier badge, days remaining / expiry, seat usage,
 * and an "upgrade / enter new key" modal.
 */
export function LicenseWidget({ headcount }: { headcount: number }) {
  const router = useRouter();
  const license = useLicense();
  const [open, setOpen] = React.useState(false);
  const [key, setKey] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const handleUpgrade = async () => {
    if (!key.trim()) {
      setError("Enter a license key.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/license/activate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ licenseKey: key }),
      });
      const data = (await response.json()) as { ok: boolean; message?: string };
      if (!response.ok || !data.ok) {
        setError(data.message ?? "Activation failed.");
        return;
      }
      setOpen(false);
      setKey("");
      router.refresh();
    } catch {
      setError("Could not reach the activation service.");
    } finally {
      setBusy(false);
    }
  };

  if (!license) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
        <ShieldCheck className="h-5 w-5" />
        No active license. Activate your instance at{" "}
        <a href="/auth/license" className="font-medium underline">
          /auth/license
        </a>
        .
      </div>
    );
  }

  const days = daysRemaining(license);
  const expiryLabel =
    license.perpetual
      ? "Perpetual"
      : license.tier === "TRIAL"
        ? `${days} day${days === 1 ? "" : "s"} remaining`
        : `Expires ${license.expiresAt ?? "—"}`;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BadgeCheck className="h-5 w-5 text-success" />
          <span className="text-sm font-semibold">{TIER_LABELS[license.tier]}</span>
          <Badge variant={TIER_BADGE[license.tier]}>{license.tier}</Badge>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline" data-testid="upgrade-license-btn">
              <KeyRound className="h-4 w-4" /> Upgrade / enter new key
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Upgrade license</DialogTitle>
              <DialogDescription>
                Enter a new Pro or Enterprise license key to replace your
                current tier.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label htmlFor="upgrade-key">License key</Label>
              <Input
                id="upgrade-key"
                data-testid="upgrade-key-input"
                value={key}
                onChange={(event) => setKey(event.target.value)}
                placeholder="FLUX-PRO-… / FLUX-ENT-…"
                className="font-mono text-sm"
                autoComplete="off"
              />
            </div>
            {error && (
              <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            )}
            <div className="rounded-lg border border-border/70 bg-card/40 px-3 py-2.5 text-xs text-muted-foreground">
              Don&apos;t have a key? Buy a plan by messaging{" "}
              <a
                href={whatsappLink(WHATSAPP_MESSAGES.generic)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 font-semibold text-primary underline underline-offset-2"
              >
                <WhatsAppIcon className="h-3 w-3" />
                {WHATSAPP_PHONE_DISPLAY}
              </a>{" "}
              on WhatsApp.
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button onClick={() => void handleUpgrade()} disabled={busy}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                Activate
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Detail label="Licensed organization" value={license.organizationName || "—"} />
        <Detail label="Owner email" value={license.ownerEmail || "—"} />
        <Detail
          label={license.perpetual ? "Status" : license.tier === "TRIAL" ? "Time left" : "Expiration"}
          value={expiryLabel}
          icon={<CalendarClock className="h-3.5 w-3.5" />}
        />
        <Detail
          label="License key"
          value={license.key ? maskLicenseKey(license.key) : "Trial (no key)"}
          mono={Boolean(license.key)}
        />
      </div>

      <div className="flex items-center gap-2 rounded-lg border border-border/70 bg-card/40 px-3 py-2.5">
        <Users className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm text-muted-foreground">
          Seats in use:{" "}
          <span className="font-semibold text-foreground">{headcount}</span> /{" "}
          {license.maxUsers || "∞"}
        </span>
      </div>
    </div>
  );
}

function Detail({
  label,
  value,
  icon,
  mono,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="space-y-1">
      <p className="label-xs flex items-center gap-1.5">
        {icon}
        {label}
      </p>
      <p className={`text-sm font-medium ${mono ? "font-mono text-xs" : ""}`}>{value}</p>
    </div>
  );
}
