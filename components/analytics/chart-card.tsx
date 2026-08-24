import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { AnalyticsChartKey } from "@/lib/types";
import { cn } from "@/lib/utils";

export function ChartCard({
  chartKey,
  title,
  description,
  children,
  className,
}: {
  chartKey: AnalyticsChartKey;
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Card
      data-testid={`analytics-chart-${chartKey}`}
      className={cn("glass", className)}
    >
      <CardHeader>
        <CardTitle className="text-sm font-semibold">{title}</CardTitle>
        {description && (
          <p className="text-xs text-muted-foreground">{description}</p>
        )}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}
