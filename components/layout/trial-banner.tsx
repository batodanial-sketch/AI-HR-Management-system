"use client";

import Link from "next/link";
import { Sparkles } from "lucide-react";
import { daysRemaining, type LicenseState } from "@/lib/license-format";
import { whatsappLink, WHATSAPP_MESSAGES } from "@/lib/whatsapp";
import { WhatsAppIcon } from "@/components/ui/whatsapp-icon";

/**
 * Persistent top banner shown during the 15-day free trial.
 */
export function TrialBanner({ state }: { state: LicenseState }) {
  const days = daysRemaining(state);
  const label =
    days === Infinity ? "Active" : `${days} Day${days === 1 ? "" : "s"} Remaining`;

  return (
    <div
      data-testid="trial-banner"
      className="flex items-center justify-center gap-2 border-b border-primary/30 bg-primary/10 px-4 py-2 text-xs font-medium text-primary"
    >
      <Sparkles className="h-3.5 w-3.5" />
      <span>
        15-Day Free Trial Active ({label})
      </span>
      <Link
        href="/settings/license"
        className="font-semibold underline underline-offset-2 hover:text-primary/80"
      >
        Manage license
      </Link>
      <span aria-hidden="true">·</span>
      <a
        href={whatsappLink(WHATSAPP_MESSAGES.pro)}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 font-semibold underline underline-offset-2 hover:text-primary/80"
      >
        <WhatsAppIcon className="h-3.5 w-3.5" />
        Upgrade to Pro
      </a>
    </div>
  );
}
