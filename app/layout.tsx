import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import "./globals.css";
import { inter } from "@/lib/fonts";
import { Providers } from "@/components/providers";
import { AppShell } from "@/components/layout/app-shell";
import { getCurrentUser } from "@/lib/auth";
import { getLicenseState } from "@/lib/license";
import { readSettings } from "@/lib/settings/config";

/**
 * Surfaces that never need an authenticated user or an active license. The
 * root layout skips the (expensive) Supabase session/profile/membership
 * round-trips for these, which removes render-blocking latency from the
 * marketing landing, pricing, docs and every auth screen.
 */
const PUBLIC_SURFACES = ["/", "/pricing", "/docs", "/login", "/signup", "/auth"];

function isPublicSurface(pathname: string): boolean {
  if (!pathname) {
    return false;
  }
  return PUBLIC_SURFACES.some(
    (surface) =>
      surface === "/" ? pathname === "/" : pathname.startsWith(surface),
  );
}

export async function generateMetadata(): Promise<Metadata> {
  const settings = await readSettings();
  const appName = settings.branding.appName || "Fluxentiq";
  return {
    title: {
      default: `${appName} — AI HR Management`,
      template: `%s · ${appName}`,
    },
    description:
      "Enterprise HR management and lead intelligence platform — employees, recruitment, leave, payroll, CRM and analytics powered by AI.",
    icons: settings.branding.faviconUrl
      ? { icon: settings.branding.faviconUrl }
      : { icon: "/brand/fluxentiq-mark.png" },
    applicationName: appName,
    formatDetection: { email: false, telephone: false, address: false },
  };
}

// Mobile correctness + PWA theme color (checklist: "Responsive Design").
// `colorScheme` is driven by the design-token CSS (`:root` = light, `.dark` =
// dark), so it is intentionally not hardcoded here.
export const viewport: Viewport = {
  themeColor: "#020510",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

/**
 * Inline, pre-paint theme guard. Runs before hydration so the stored theme is
 * applied without a flash of the wrong theme. Dark is the brand default when no
 * preference has been stored yet. Static string — no user input, no XSS surface.
 */
const THEME_GUARD = `(function(){try{var t=window.localStorage.getItem("fluxentiq.theme");var d=t?t==="dark":true;document.documentElement.classList.toggle("dark",d);}catch(e){document.documentElement.classList.add("dark");}})();`;

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = headers().get("x-pathname") ?? "";
  const settings = await readSettings();

  // Public surfaces (marketing + auth) don't render authenticated chrome, so
  // skip the session + license resolution entirely. `useUser()` and
  // `useLicense()` fall back to their safe defaults on the client.
  const publicSurface = isPublicSurface(pathname);
  const user = publicSurface ? null : await getCurrentUser();
  const license = publicSurface ? null : await getLicenseState();

  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_GUARD }} />
      </head>
      <body className={`${inter.variable} min-h-screen font-sans antialiased`}>
        <Providers user={user} branding={settings.branding} license={license}>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}
