/**
 * Notifications Hook
 *
 * SWR で通知一覧を共有キャッシュし、デデュープする。
 */

import { useCallback } from "react";
import useSWR from "swr";
import { parseApiErrorResponse, toAppUiError } from "@/lib/api-errors";
import { notifySwrUserFacingFailure } from "@/lib/client-error-ui";
import { buildAuthFetchHeaders, notificationsListUrl } from "@/lib/swr-fetcher";

const NOTIFICATIONS_FETCH_FALLBACK = {
  code: "NOTIFICATIONS_FETCH_FAILED",
  userMessage: "通知を読み込めませんでした。",
  action: "ページを再読み込みして、もう一度お試しください。",
  retryable: true,
} as const;

export type NotificationType =
  | "deadline_reminder"
  | "deadline_near"
  | "company_fetch"
  | "es_review"
  | "daily_summary"
  | "calendar_sync_failed";

export const NOTIFICATION_TYPE_LABELS: Record<NotificationType, string> = {
  deadline_reminder: "締切リマインド",
  deadline_near: "締切が近づいています",
  company_fetch: "企業情報取得",
  es_review: "ES添削完了",
  daily_summary: "デイリーサマリー",
  calendar_sync_failed: "Google同期エラー",
};

export const NOTIFICATION_TYPE_ICONS: Record<NotificationType, string> = {
  deadline_reminder: "⏰",
  deadline_near: "🔔",
  company_fetch: "🏢",
  es_review: "✨",
  daily_summary: "📋",
  calendar_sync_failed: "📅",
};

export interface Notification {
  id: string;
  userId: string | null;
  guestId: string | null;
  type: NotificationType;
  title: string;
  message: string;
  data: string | null;
  isRead: boolean;
  createdAt: string;
  expiresAt: string | null;
}

export interface NotificationsResponse {
  notifications: Notification[];
  unreadCount: number;
}

export interface UseNotificationsOptions {
  limit?: number;
  unreadOnly?: boolean;
  initialData?: NotificationsResponse;
}

async function fetchNotificationsList(url: string): Promise<NotificationsResponse> {
  const response = await fetch(url, {
    headers: buildAuthFetchHeaders(),
    credentials: "include",
  });
  if (!response.ok) {
    throw await parseApiErrorResponse(response, NOTIFICATIONS_FETCH_FALLBACK, "useNotifications.fetch");
  }
  const data = await response.json();
  return {
    notifications: data.notifications || [],
    unreadCount: data.unreadCount || 0,
  };
}

function cloneNotificationsResponse(response: NotificationsResponse): NotificationsResponse {
  return {
    notifications: response.notifications.map((notification) => ({ ...notification })),
    unreadCount: response.unreadCount,
  };
}

function updateReadState(
  current: NotificationsResponse,
  notificationId: string,
  nextIsRead: boolean
): NotificationsResponse {
  let unreadCount = current.unreadCount;
  const notifications = current.notifications.map((notification) => {
    if (notification.id !== notificationId) {
      return notification;
    }

    if (notification.isRead === nextIsRead) {
      return notification;
    }

    unreadCount += nextIsRead ? -1 : 1;
    return { ...notification, isRead: nextIsRead };
  });

  return {
    notifications,
    unreadCount: Math.max(0, unreadCount),
  };
}

export function useNotifications(options: UseNotificationsOptions = {}) {
  const swrKey = notificationsListUrl(options.limit, options.unreadOnly);

  const { data, error, isLoading, mutate } = useSWR<NotificationsResponse>(swrKey, fetchNotificationsList, {
    revalidateOnFocus: false,
    dedupingInterval: 3000,
    fallbackData: options.initialData,
    revalidateOnMount: !options.initialData,
    onError(err, key) {
      const ui = toAppUiError(err, NOTIFICATIONS_FETCH_FALLBACK, "useNotifications.swr");
      notifySwrUserFacingFailure(ui, typeof key === "string" ? key : JSON.stringify(key));
    },
  });

  const notifications = data?.notifications ?? [];
  const unreadCount = data?.unreadCount ?? 0;
  const errorMessage =
    error instanceof Error ? error.message : error != null ? "通知の取得に失敗しました" : null;

  const refresh = useCallback(() => mutate(), [mutate]);

  const markAsRead = useCallback(
    async (notificationId: string): Promise<boolean> => {
      const current = data ? cloneNotificationsResponse(data) : { notifications: [], unreadCount: 0 };
      const next = updateReadState(current, notificationId, true);

      await mutate(next, { revalidate: false });

      try {
        const response = await fetch(`/api/notifications/${notificationId}/read`, {
          method: "POST",
          headers: buildAuthFetchHeaders(),
          credentials: "include",
        });

        if (!response.ok) {
          throw new Error("Failed to mark notification as read");
        }

        return true;
      } catch {
        await mutate(current, { revalidate: false });
        return false;
      }
    },
    [data, mutate]
  );

  const markAllAsRead = useCallback(async (): Promise<boolean> => {
    const current = data ? cloneNotificationsResponse(data) : { notifications: [], unreadCount: 0 };
    const next = {
      notifications: current.notifications.map((notification) => ({ ...notification, isRead: true })),
      unreadCount: 0,
    };

    await mutate(next, { revalidate: false });

    try {
      const response = await fetch("/api/notifications/read-all", {
        method: "POST",
        headers: buildAuthFetchHeaders(),
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error("Failed to mark all notifications as read");
      }

      return true;
    } catch {
      await mutate(current, { revalidate: false });
      return false;
    }
  }, [data, mutate]);

  const deleteNotification = useCallback(
    async (notificationId: string): Promise<boolean> => {
      const current = data ? cloneNotificationsResponse(data) : { notifications: [], unreadCount: 0 };
      const removed = current.notifications.find((notification) => notification.id === notificationId);
      const next = {
        notifications: current.notifications.filter((notification) => notification.id !== notificationId),
        unreadCount:
          removed && !removed.isRead
            ? Math.max(0, current.unreadCount - 1)
            : current.unreadCount,
      };

      await mutate(next, { revalidate: false });

      try {
        const response = await fetch(`/api/notifications/${notificationId}`, {
          method: "DELETE",
          headers: buildAuthFetchHeaders(),
          credentials: "include",
        });

        if (!response.ok) {
          throw new Error("Failed to delete notification");
        }

        return true;
      } catch {
        await mutate(current, { revalidate: false });
        return false;
      }
    },
    [data, mutate]
  );

  const deleteAllNotifications = useCallback(async (): Promise<boolean> => {
    const current = data ? cloneNotificationsResponse(data) : { notifications: [], unreadCount: 0 };
    const next = {
      notifications: [],
      unreadCount: 0,
    };

    await mutate(next, { revalidate: false });

    try {
      const response = await fetch("/api/notifications/delete", {
        method: "POST",
        headers: buildAuthFetchHeaders(),
        credentials: "include",
        body: JSON.stringify({ all: true }),
      });

      if (!response.ok) {
        throw new Error("Failed to delete all notifications");
      }

      return true;
    } catch {
      await mutate(current, { revalidate: false });
      return false;
    }
  }, [data, mutate]);

  return {
    notifications,
    unreadCount,
    isLoading,
    error: errorMessage,
    refresh,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    deleteAllNotifications,
  };
}
