import type { NotificationsResponse } from "@/lib/dto/notifications";

export function buildNotificationPreviewData(
  response: NotificationsResponse | null | undefined,
  limit = 5
): NotificationsResponse {
  return {
    notifications: response?.notifications.slice(0, limit) ?? [],
    unreadCount: response?.unreadCount ?? 0,
  };
}
