import Link from "next/link";
import { Check, Minus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SparklesBadge } from "@/components/marketing/site-shell";
import { WhatsAppIcon } from "@/components/ui/whatsapp-icon";
import { whatsappLink, WHATSAPP_MESSAGES, WHATSAPP_PHONE_DISPLAY } from "@/lib/whatsapp";

const ROWS: Array<{ label: string; trial: boolean; pro: boolean; enterprise: boolean }> = [
  { label: "Full HR + CRM modules", trial: true, pro: true, enterprise: true },
  { label: "AI Copilot (screen, rank, report)", trial: true, pro: true, enterprise: true },
  { label: "Groq AI route (rate-limited)", trial: true, pro: true, enterprise: true },
  { label: "Custom BYOK AI providers", trial: false, pro: true, enterprise: true },
  { label: "Unlimited employee headcount", trial: false, pro: true, enterprise: true },
  { label: "Lead CSV bulk exports", trial: false, pro: true, enterprise: true },
  { label: "White-label branding", trial: false, pro: true, enterprise: true },
  { label: "Full source code access", trial: false, pro: false, enterprise: true },
  { label: "Perpetual license", trial: false, pro: false, enterprise: true },
  { label: "Priority support", trial: false, pro: false, enterprise: true },
];

function Cell({ value }: { value: boolean }) {
  return value ? (
    <Check className="mx-auto h-4 w-4 text-success" />
  ) : (
    <Minus className="mx-auto h-4 w-4 text-muted-foreground/40" />
  );
}

export default function PricingPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-20 md:px-6">
      <div className="mb-12 text-center">
        <div className="mb-4 flex justify-center">
          <SparklesBadge>Simple, transparent licensing</SparklesBadge>
        </div>
        <h1 className="text-4xl font-extrabold tracking-tight">Pricing</h1>
        <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
          One-time licenses and a free trial. No per-seat surprises, no monthly
          lock-in — you own the software.
        </p>
      </div>

      <div className="glass overflow-x-auto rounded-2xl">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="border-b border-border text-left">
              <th className="px-6 py-5 font-semibold">Feature</th>
              <th className="px-6 py-5 text-center font-semibold">
                <span className="block">Free Trial</span>
                <span className="text-xs font-normal text-muted-foreground">15 days</span>
              </th>
              <th className="px-6 py-5 text-center font-semibold">
                <span className="block text-primary">Pro</span>
                <span className="text-xs font-normal text-muted-foreground">Subscription</span>
              </th>
              <th className="px-6 py-5 text-center font-semibold">
                <span className="block">Enterprise</span>
                <span className="text-xs font-normal text-muted-foreground">Source code</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row, index) => (
              <tr
                key={row.label}
                className={index % 2 === 0 ? "bg-card/30" : ""}
              >
                <td className="px-6 py-3.5">{row.label}</td>
                <td className="px-6 py-3.5 text-center"><Cell value={row.trial} /></td>
                <td className="px-6 py-3.5 text-center"><Cell value={row.pro} /></td>
                <td className="px-6 py-3.5 text-center"><Cell value={row.enterprise} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
        <Button size="lg" asChild>
          <Link href="/auth/license">Start 15-day free trial</Link>
        </Button>
        <Button size="lg" asChild>
          <a href={whatsappLink(WHATSAPP_MESSAGES.pro)} target="_blank" rel="noopener noreferrer">
            <WhatsAppIcon className="h-4 w-4" /> Buy Pro on WhatsApp
          </a>
        </Button>
        <Button size="lg" asChild>
          <a href={whatsappLink(WHATSAPP_MESSAGES.enterprise)} target="_blank" rel="noopener noreferrer">
            <WhatsAppIcon className="h-4 w-4" /> Buy Enterprise on WhatsApp
          </a>
        </Button>
        <Button size="lg" variant="outline" asChild>
          <Link href="/auth/license">Enter license key</Link>
        </Button>
      </div>

      <p className="mt-8 text-center text-sm text-muted-foreground">
        All plans are purchased directly by messaging{" "}
        <a
          href={whatsappLink(WHATSAPP_MESSAGES.generic)}
          target="_blank"
          rel="noopener noreferrer"
          className="font-semibold text-foreground underline underline-offset-2 hover:text-primary"
        >
          {WHATSAPP_PHONE_DISPLAY}
        </a>{" "}
        on WhatsApp — we'll send you a signed license key after confirming your
        plan, headcount and payment.
      </p>
    </div>
  );
}
