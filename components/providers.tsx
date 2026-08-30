"use client";

import * as React from "react";
import { MotionConfig } from "framer-motion";
import { CopilotProvider } from "@/components/copilot/copilot-provider";
import { ToastProvider } from "@/components/ui/toast";
import { RouteErrorToast } from "@/components/layout/route-error-toast";
import { TooltipProvider } from "@/components/ui/tooltip";
import { applyAccent, findAccent } from "@/lib/appearance";
import { applyBrandAccent } from "@/lib/branding";
import type { SessionUser } from "@/lib/auth";
import type { BrandingSettings } from "@/lib/settings/config";
import {
  hasFeatureAccess,
  type FeatureKey,
  type LicenseState,
} from "@/lib/license-format";
import type { CurrencyCode } from "@/lib/types";

/** Global application settings (theme, accent, currency). */
interface SettingsContextValue {
  theme: "light" | "dark";
  setTheme: (theme: "light" | "dark") => void;
  accent: string;
  setAccent: (accent: string) => void;
  currency: CurrencyCode;
  setCurrency: (currency: CurrencyCode) => void;
}

const SettingsContext = React.createContext<SettingsContextValue | null>(null);

export function useSettings(): SettingsContextValue {
  const value = React.useContext(SettingsContext);
  if (!value) {
    throw new Error("useSettings must be used within <Providers>.");
  }
  return value;
}

const UserContext = React.createContext<SessionUser | null>(null);

export function useUser(): SessionUser {
  const value = React.useContext(UserContext);
  if (!value) {
    return {
      id: "demo-user",
      email: "ayesha.rahman@fluxentiq.test",
      fullName: "Ayesha Rahman",
      organizationId: null,
      role: "admin",
    };
  }
  return value;
}

const BrandingContext = React.createContext<BrandingSettings | null>(null);

export function useBranding(): BrandingSettings {
  return (
    React.useContext(BrandingContext) ?? {
      appName: "Fluxentiq",
      vendorName: "Fluxentiq",
      accent: "",
      logoUrl: "",
      faviconUrl: "",
    }
  );
}

const LicenseContext = React.createContext<LicenseState | null>(null);

export function useLicense(): LicenseState | null {
  return React.useContext(LicenseContext);
}

/** True when the active license/trial grants access to a gated feature. */
export function useFeatureAccess(feature: FeatureKey): boolean {
  const license = React.useContext(LicenseContext);
  return hasFeatureAccess(license, feature);
}

function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = React.useState<"light" | "dark">("dark");
  const [accent, setAccentState] = React.useState("indigo");
  const [currency, setCurrency] = React.useState<CurrencyCode>("USD");

  const setTheme = React.useCallback((next: "light" | "dark") => {
    setThemeState(next);
    const root = document.documentElement;
    root.classList.toggle("dark", next === "dark");
    window.localStorage.setItem("fluxentiq.theme", next);
  }, []);

  const setAccent = React.useCallback((next: string) => {
    setAccentState(next);
    applyAccent(findAccent(next));
    window.localStorage.setItem("fluxentiq.accent", next);
  }, []);

  React.useEffect(() => {
    const storedTheme = window.localStorage.getItem("fluxentiq.theme");
    if (storedTheme === "light" || storedTheme === "dark") {
      setTheme(storedTheme);
    } else {
      setTheme("dark");
    }

    const storedAccent = window.localStorage.getItem("fluxentiq.accent");
    if (storedAccent) {
      setAccent(storedAccent);
    } else {
      applyAccent(findAccent("indigo"));
    }
  }, [setTheme, setAccent]);

  const value = React.useMemo<SettingsContextValue>(
    () => ({ theme, setTheme, accent, setAccent, currency, setCurrency }),
    [theme, setTheme, accent, setAccent, currency],
  );

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
}

export function Providers({
  user,
  branding,
  license,
  children,
}: {
  user: SessionUser | null;
  branding: BrandingSettings;
  license: LicenseState | null;
  children: React.ReactNode;
}) {
  return (
    <TooltipProvider delayDuration={200}>
      <MotionConfig reducedMotion="user">
        <SettingsProvider>
          <UserContext.Provider value={user}>
            <BrandingContext.Provider value={branding}>
              <LicenseContext.Provider value={license}>
                <ToastProvider>
                  <BrandingApplier accent={branding.accent} />
                  <RouteErrorToast />
                  <CopilotProvider organizationId={user?.organizationId ?? null}>
                    {children}
                  </CopilotProvider>
                </ToastProvider>
              </LicenseContext.Provider>
            </BrandingContext.Provider>
          </UserContext.Provider>
        </SettingsProvider>
      </MotionConfig>
    </TooltipProvider>
  );
}

/** Applies the admin-set brand accent (when configured) on mount. */
function BrandingApplier({ accent }: { accent: string }) {
  React.useEffect(() => {
    if (accent) {
      applyBrandAccent(accent);
    }
  }, [accent]);
  return null;
}
