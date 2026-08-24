"use client";

import Link from "next/link";
import { Lock } from "lucide-react";
import { whatsappLink, WHATSAPP_MESSAGES } from "@/lib/whatsapp";
import { WhatsAppIcon } from "@/components/ui/whatsapp-icon";

/**
 * "Pro Feature" locks for gated surfaces. `ProLockOverlay` dims and locks a
 * whole card; `LockedBadge` is an inline lock chip for buttons/tooltips.
 */
export function ProLockOverlay({ label }: { label?: string }) {
  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 rounded-xl bg-background/60 backdrop-blur-[2px]">
      <span className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card shadow-md">
        <Lock className="h-4 w-4 text-muted-foreground" />
      </span>
      <p className="text-xs font-semibold text-muted-foreground">
        {label ?? "Pro Feature"}
      </p>
      <a
        href={whatsappLink(WHATSAPP_MESSAGES.pro)}
        target="_blank"
        rel="noopener noreferrer"
        className="pointer-events-auto inline-flex items-center gap-1 text-xs font-medium text-primary underline underline-offset-2 hover:text-primary/80"
      >
        <WhatsAppIcon className="h-3 w-3" />
        Upgrade to unlock
      </a>
    </div>
  );
}

export function LockedBadge({ label }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
      <Lock className="h-3 w-3" />
      {label ?? "Pro"}
    </span>
  );
}
