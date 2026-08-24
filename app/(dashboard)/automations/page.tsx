import type { Metadata } from "next";
import Link from "next/link";
import { Workflow } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { initialWorkflowNodes, initialWorkflowEdges } from "@/lib/data";

export const metadata: Metadata = { title: "Automations" };

export default async function AutomationsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Automations"
        description="Workflow automations triggered by HR events."
        actions={
          <Button asChild>
            <Link href="/workflows/builder">
              <Workflow className="h-4 w-4" /> Open builder
            </Link>
          </Button>
        }
      />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="glass">
          <CardHeader>
            <CardTitle className="text-sm font-semibold">Employee onboarding</CardTitle>
            <CardDescription>
              {initialWorkflowNodes.length} nodes · {initialWorkflowEdges.length} connection
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Triggered on <code className="font-mono text-xs">employee.created</code> — sends a
              welcome email and provisions workspace access.
            </p>
          </CardContent>
        </Card>
        <Card className="glass">
          <CardHeader>
            <CardTitle className="text-sm font-semibold">Leave approval</CardTitle>
            <CardDescription>Workflow template</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Triggered on <code className="font-mono text-xs">leave.requested</code> — notifies the
              manager and routes to the approval queue.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
