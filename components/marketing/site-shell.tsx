import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BrandLogo } from "@/components/ui/brand-logo";
import type { BrandingSettings } from "@/lib/settings/config";

/**
 * Marketing site shell — top navigation and footer for the public landing,
 * pricing and docs pages. Uses the admin-configured app name (white-label).
 */
export function SiteShell({
  branding,
  children,
}: {
  branding: BrandingSettings;
  children: React.ReactNode;
}) {
  const appName = branding.appName || "Fluxentiq";

  return (
    <div className="flex min-h-screen flex-col">
      <SiteNav appName={appName} />
      <main className="flex-1">{children}</main>
      <SiteFooter appName={appName} />
    </div>
  );
}

export function SiteNav({ appName }: { appName: string }) {
  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/70 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 md:px-6">
        <Link href="/" className="flex items-center gap-2.5">
          <BrandLogo size={32} alt={`${appName} logo`} className="rounded-lg" />
          <span className="text-sm font-bold tracking-tight">{appName}</span>
        </Link>

        <nav className="hidden items-center gap-6 text-sm text-muted-foreground md:flex">
          <Link href="/#features" className="transition-colors hover:text-foreground">
            Features
          </Link>
          <Link href="/#byok" className="transition-colors hover:text-foreground">
            BYOK AI
          </Link>
          <Link href="/pricing" className="transition-colors hover:text-foreground">
            Pricing
          </Link>
          <Link href="/docs" className="transition-colors hover:text-foreground">
            Docs
          </Link>
        </nav>

        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/login">Sign in</Link>
          </Button>
          <Button size="sm" asChild>
            <Link href="/auth/license">
              Start free trial <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>
    </header>
  );
}

export function SiteFooter({ appName }: { appName: string }) {
  return (
    <footer className="border-t border-border/70 py-10">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 px-4 text-center md:flex-row md:justify-between md:text-left">
        <div className="flex items-center gap-2.5">
          <BrandLogo size={28} alt={`${appName} logo`} />
          <span className="text-sm font-semibold">{appName}</span>
        </div>
        <p className="text-xs text-muted-foreground">
          Self-hosted · Bring-your-own-key AI · White-label ready
        </p>
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <Link href="/docs" className="hover:text-foreground">
            Documentation
          </Link>
          <Link href="/pricing" className="hover:text-foreground">
            Pricing
          </Link>
          <Link href="/login" className="hover:text-foreground">
            Sign in
          </Link>
        </div>
      </div>
    </footer>
  );
}

export function SparklesBadge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary backdrop-blur-md">
      <Sparkles className="h-3.5 w-3.5" />
      {children}
    </span>
  );
}
