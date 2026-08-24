"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { Sidebar } from "./sidebar";
import { TopNav } from "./top-nav";
import { TrialBanner } from "./trial-banner";
import { useBranding, useLicense, useUser } from "@/components/providers";

/**
 * Application shell — persistent chrome around every route. The sidebar and
 * top navigation are hidden on the auth/license/onboarding surfaces, users
 * without a workspace are routed to onboarding, unlicensed instances are
 * routed to the license activation screen, and trial users see a persistent
 * upgrade banner.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const user = useUser();
  const branding = useBranding();
  const license = useLicense();

  // Public auth surfaces — rendered chrome-free (no sidebar, search, copilot,
  // or avatar). `/signup` is included here so account creation NEVER renders
  // the dashboard shell nor trips the license/onboarding redirect guards.
  const isAuthRoute =
    pathname.startsWith("/login") || pathname.startsWith("/signup");
  const isLicenseRoute = pathname.startsWith("/auth/license");
  const isOnboarding = pathname.startsWith("/onboarding");
  const isPublicApi = pathname.startsWith("/api");
  const isMarketing =
    pathname === "/" || pathname === "/pricing" || pathname === "/docs";

  const needsLicense =
    !isAuthRoute &&
    !isLicenseRoute &&
    !isOnboarding &&
    !isPublicApi &&
    !isMarketing &&
    !license;
  const needsOnboarding =
    !isAuthRoute &&
    !isLicenseRoute &&
    !isOnboarding &&
    !isPublicApi &&
    !isMarketing &&
    Boolean(license) &&
    !user.organizationId;

  React.useEffect(() => {
    if (needsLicense) {
      router.replace("/auth/license");
      return;
    }
    if (needsOnboarding) {
      router.replace("/onboarding");
    }
  }, [needsLicense, needsOnboarding, router]);

  if (isAuthRoute || isLicenseRoute || isOnboarding || isMarketing) {
    return (
      <div data-testid="app-root" className="min-h-screen app-ambient">
        {children}
      </div>
    );
  }

  const isTrial = license?.tier === "TRIAL";

  return (
    <div data-testid="app-root" className="flex min-h-screen app-ambient">
      {/* Skip link — keyboard users jump straight to content (Pro Max #1). */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-primary-foreground"
      >
        Skip to content
      </a>
      <Sidebar appName={branding.appName} logoUrl={branding.logoUrl} />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopNav />
        {isTrial && license && <TrialBanner state={license} />}
        <main
          id="main-content"
          className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-6 md:px-6 lg:px-8"
        >
          {children}
        </main>
      </div>
    </div>
  );
}
