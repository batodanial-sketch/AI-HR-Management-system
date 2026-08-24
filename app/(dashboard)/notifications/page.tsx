import type { Metadata } from "next";
import { Bell, CalendarClock, ShieldAlert, Sparkles } from "lucide-react";
import { getNotifications, type AppNotification } from "@/lib/notifications";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Notifications" };

const KIND_META: Record<AppNotification["kind"], { icon: typeof Bell; label: string }> = {
  approval: { icon: CalendarClock, label: "Approval" },
  alert: { icon: ShieldAlert, label: "Alert" },
  info: { icon: Sparkles, label: "Info" },
  workflow: { icon: Bell, label: "Workflow" },
};

export default async function NotificationsPage() {
  const notifications = await getNotifications();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Notifications"
        description="Your in-app feed of approvals, alerts and workflow events."
      />
      <div className="glass divide-y divide-border/60 rounded-xl">
        {notifications.length === 0 && (
          <div className="px-4 py-12 text-center text-sm text-muted-foreground">
            No notifications yet. Approvals and workflow events will appear here.
          </div>
        )}
        {notifications.map((notification) => {
          const meta = KIND_META[notification.kind];
          const Icon = meta.icon;
          return (
            <div key={notification.id} className="flex items-start gap-3 px-5 py-4">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
                <Icon className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium">{notification.title}</p>
                  {!notification.read && <Badge variant="accent" className="h-1.5 w-1.5 rounded-full p-0" />}
                </div>
                {notification.description && (
                  <p className="mt-0.5 text-xs text-muted-foreground">{notification.description}</p>
                )}
              </div>
              <span className="shrink-0 text-xs text-muted-foreground">
                {formatDate(notification.timestamp)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
