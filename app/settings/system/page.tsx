import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { SystemHealth } from "@/components/settings/system-health";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "System Health",
};

export default function SystemHealthPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="System Health"
        description="Live status of the AI bridge, memory backend and license."
      />
      <Card className="glass">
        <CardHeader>
          <CardTitle className="text-sm font-semibold">Instance status</CardTitle>
          <CardDescription>
            Real-time health of every subsystem powering this instance.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SystemHealth />
        </CardContent>
      </Card>
    </div>
  );
}
