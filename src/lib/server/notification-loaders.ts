import { and, count, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { notifications } from "@/lib/db/schema";
import type { RequestIdentity } from "@/app/api/_shared/request-identity";
import type { Notification } from "@/hooks/useNotifications";

export interface NotificationsPageData {
  notifications: Notification[];
  unreadCount: number;
}

function buildNotificationWhere(identity: RequestIdentity) {
  return identity.userId
    ? eq(notifications.userId, identity.userId)
    : eq(notifications.guestId, identity.guestId!);
}

function serializeDate(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

export async function getNotificationsPageData(
  identity: RequestIdentity | null,
  limit = 50
): Promise<NotificationsPageData> {
  if (!identity) {
    return {
      notifications: [],
      unreadCount: 0,
    };
  }

  const whereClause = buildNotificationWhere(identity);

  const [notificationRows, unreadCountRows] = await Promise.all([
    db
      .select()
      .from(notifications)
      .where(whereClause)
      .orderBy(desc(notifications.createdAt))
      .limit(limit),
    db
      .select({ unreadCount: count() })
      .from(notifications)
      .where(and(whereClause, eq(notifications.isRead, false)))
      .limit(1),
  ]);

  return {
    notifications: notificationRows.map((notification) => ({
      ...notification,
      type: notification.type as Notification["type"],
      createdAt: serializeDate(notification.createdAt) ?? new Date().toISOString(),
      expiresAt: serializeDate(notification.expiresAt),
    })),
    unreadCount: Number(unreadCountRows[0]?.unreadCount ?? 0),
  };
}
