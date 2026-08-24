import type { Metadata } from "next";
import { getEmployees } from "@/lib/api";
import { PageHeader } from "@/components/layout/page-header";
import { LicenseWidget } from "@/components/settings/license-widget";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Instance & License",
};

export default async function LicensePage() {
  const employees = await getEmployees();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Instance & License"
        description="Your active tier, seat allocation and license management."
      />
      <Card className="glass">
        <CardHeader>
          <CardTitle className="text-sm font-semibold">License</CardTitle>
          <CardDescription>
            Manage your Fluxentiq license or upgrade your tier.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <LicenseWidget headcount={employees.length} />
        </CardContent>
      </Card>
    </div>
  );
}
