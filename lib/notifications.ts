import "server-only";
import { hasSupabaseEnv, serverClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";

/**
 * In-app notification service — writes to the Supabase `notifications` table
 * and reads the current user's feed (replacing the hardcoded seed in the
 * top-nav). Offline mode falls back to the seed records in `lib/data.ts`.
 */

export type NotificationKind = "approval" | "alert" | "info" | "workflow";

export interface AppNotification {
  id: string;
  kind: NotificationKind;
  title: string;
  description: string | null;
  read: boolean;
  timestamp: string;
}

export async function createNotification(input: {
  userId?: string;
  kind: NotificationKind;
  title: string;
  description?: string;
}): Promise<void> {
  const user = await getCurrentUser();

  if (hasSupabaseEnv() && user.organizationId) {
    const { error } = await serverClient().from("notifications").insert({
      organization_id: user.organizationId,
      user_id: input.userId ?? user.id,
      kind: input.kind,
      title: input.title,
      description: input.description ?? null,
    });
    if (error) {
      console.error("[notifications] create failed:", error.message);
    }
    return;
  }
  console.info(`[notifications] ${input.kind}: ${input.title}`);
}

export async function getNotifications(): Promise<AppNotification[]> {
  if (!hasSupabaseEnv()) {
    // Demo fallback — the top-nav already renders seed notifications.
    return [];
  }
  const user = await getCurrentUser();

  const { data, error } = await serverClient()
    .from("notifications")
    .select("*")
    .or(`user_id.eq.${user.id},user_id.is.null`)
    .order("created_at", { ascending: false })
    .limit(25);

  if (error || !data) {
    return [];
  }
  return data.map((row) => ({
    id: row.id,
    kind: row.kind as NotificationKind,
    title: row.title,
    description: row.description,
    read: row.read,
    timestamp: row.created_at,
  }));
}

export async function markAllNotificationsRead(): Promise<void> {
  if (!hasSupabaseEnv()) {
    return;
  }
  const user = await getCurrentUser();
  await serverClient()
    .from("notifications")
    .update({ read: true })
    .eq("user_id", user.id)
    .eq("read", false);
}

export async function unreadCount(): Promise<number> {
  if (!hasSupabaseEnv()) {
    return 0;
  }
  const user = await getCurrentUser();
  const { count, error } = await serverClient()
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("read", false);
  if (error) {
    return 0;
  }
  return count ?? 0;
}
