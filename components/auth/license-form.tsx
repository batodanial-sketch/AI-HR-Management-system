"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowRight,
  CheckCircle2,
  KeyRound,
  Loader2,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BrandLogo } from "@/components/ui/brand-logo";
import { WhatsAppIcon } from "@/components/ui/whatsapp-icon";
import { whatsappLink, WHATSAPP_MESSAGES, WHATSAPP_PHONE_DISPLAY } from "@/lib/whatsapp";

interface ActivateResponse {
  ok: boolean;
  message?: string;
  license?: {
    tier: string;
    organizationName: string;
    ownerEmail: string;
    maxUsers: number;
    perpetual: boolean;
    expiresAt: string | null;
  };
}

export function LicenseForm() {
  const router = useRouter();
  const [key, setKey] = React.useState("");
  const [mode, setMode] = React.useState<"idle" | "activating" | "trialing" | "success">(
    "idle",
  );
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<ActivateResponse["license"] | null>(null);

  const goDashboard = () => {
    router.push("/dashboard");
    router.refresh();
  };

  const handleActivate = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    if (!key.trim()) {
      setError("Enter your license key.");
      return;
    }
    setMode("activating");
    try {
      const response = await fetch("/api/license/activate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ licenseKey: key }),
      });
      const data = (await response.json()) as ActivateResponse;
      if (!response.ok || !data.ok) {
        setError(data.message ?? "Activation failed.");
        setMode("idle");
        return;
      }
      setSuccess(data.license ?? null);
      setMode("success");
      window.setTimeout(goDashboard, 1400);
    } catch {
      setError("Could not reach the activation service.");
      setMode("idle");
    }
  };

  const handleTrial = async () => {
    setError(null);
    setMode("trialing");
    try {
      // Start (or resume) the trial FIRST — this persists the trial state and
      // stamps the `fluxentiq.trial` httpOnly cookie — so the middleware license
      // gate lets the user through to /dashboard instead of bouncing them back
      // to /auth/license (the redirect loop). The 10s timeout guarantees the
      // button can never freeze in a perpetual spinner if the request hangs.
      const response = await fetch("/api/license/trial", {
        method: "POST",
        signal: AbortSignal.timeout(10_000),
      });
      const data = (await response.json()) as {
        ok?: boolean;
        success?: boolean;
        authenticated?: boolean;
        message?: string;
      };
      if (!response.ok || !(data.ok === true || data.success === true)) {
        setError(data.message ?? "Could not start the trial.");
        setMode("idle");
        return;
      }
      // Hard navigation (not router.push): a full page load deterministically
      // re-runs middleware with the now-set trial cookie. A returning user with
      // a live session goes straight to /dashboard; a brand-new visitor is sent
      // to /signup to create the account their trial will be attached to (no
      // dead-end bounce to /login or /auth/license).
      window.location.href = data.authenticated ? "/dashboard" : "/signup";
    } catch {
      setError("Could not reach the trial service. Please try again.");
      setMode("idle");
    }
  };

  const busy = mode === "activating" || mode === "trialing";

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-card shadow-lg">
            <BrandLogo size={36} alt="Fluxentiq logo" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Activate your instance</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Enter your license key, or start a free 15-day trial.
          </p>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
          className="glass-strong rounded-2xl p-6"
        >
          {success ? (
            <div className="flex flex-col items-center gap-3 py-4 text-center">
              <CheckCircle2 className="h-12 w-12 text-success" />
              <p className="text-sm font-semibold">
                {success.organizationName} · {success.tier}
              </p>
              <p className="text-xs text-muted-foreground">
                {success.perpetual
                  ? "Perpetual license"
                  : `Expires ${success.expiresAt ?? ""}`}
                {" · "}
                {success.maxUsers} users
              </p>
              <p className="text-sm text-muted-foreground">Activating…</p>
            </div>
          ) : (
            <form onSubmit={handleActivate} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="license-key">License key</Label>
                <div className="relative">
                  <KeyRound className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="license-key"
                    data-testid="license-input-field"
                    value={key}
                    onChange={(event) => setKey(event.target.value)}
                    placeholder="FLUX-PRO-… / FLUX-ENT-…"
                    className="pl-9 font-mono text-sm"
                    autoComplete="off"
                    autoCorrect="off"
                    spellCheck={false}
                    aria-autocomplete="none"
                    data-1p-ignore="true"
                    data-lpignore="true"
                    disabled={busy}
                  />
                </div>
              </div>

              {error && (
                <p
                  data-testid="license-error-message"
                  className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
                >
                  {error}
                </p>
              )}

              <Button
                type="submit"
                data-testid="activate-key-btn"
                className="w-full"
                disabled={busy}
              >
                {mode === "activating" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ShieldCheck className="h-4 w-4" />
                )}
                Activate License
              </Button>

              <div className="flex items-center gap-3">
                <span className="h-px flex-1 bg-border" />
                <span className="text-xs text-muted-foreground">or</span>
                <span className="h-px flex-1 bg-border" />
              </div>

              <Button
                type="button"
                variant="outline"
                data-testid="continue-trial-btn"
                aria-busy={mode === "trialing"}
                className="relative z-10 w-full"
                onClick={() => void handleTrial()}
                disabled={busy}
              >
                {mode === "trialing" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 text-primary" />
                    Continue with 15-Day Free Trial
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </Button>

              <p className="flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
                <ShieldCheck className="h-3 w-3" />
                Validated offline — no license server required.
              </p>

              <p className="text-center text-xs text-muted-foreground">
                Need a license? Message{" "}
                <a
                  href={whatsappLink(WHATSAPP_MESSAGES.generic)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
                >
                  <WhatsAppIcon className="h-3 w-3" />
                  {WHATSAPP_PHONE_DISPLAY}
                </a>{" "}
                on WhatsApp.
              </p>

              <p className="text-center text-xs text-muted-foreground">
                Already have an account?{" "}
                <Link href="/login" className="font-medium text-primary hover:underline">
                  Sign in
                </Link>
              </p>
            </form>
          )}
        </motion.div>
      </div>
    </div>
  );
}
