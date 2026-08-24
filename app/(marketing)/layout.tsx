import type { Metadata } from "next";
import { readSettings } from "@/lib/settings/config";
import { SiteShell } from "@/components/marketing/site-shell";

export const metadata: Metadata = {
  title: "Home",
};

export default async function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const settings = await readSettings();
  return <SiteShell branding={settings.branding}>{children}</SiteShell>;
}
