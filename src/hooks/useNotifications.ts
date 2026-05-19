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
import type { Notification, NotificationType, NotificationsResponse } from "@/lib/dto/notifications";

const NOTIFICATIONS_FETCH_FALLBACK = {
  code: "NOTIFICATIONS_FETCH_FAILED",
  userMessage: "通知を読み込めませんでした。",
  action: "ページを再読み込みして、もう一度お試しください。",
  retryable: true,
} as const;

export const NOTIFICATION_TYPE_LABELS: Record<NotificationType, string> = {
  deadline_reminder: "締切リマインド",
  deadline_near: "締切が近づいています",
  company_fetch: "企業情報取得",
  es_review: "ES添削完了",
  daily_summary: "デイリーサマリー",
  calendar_sync_failed: "Google同期エラー",
  billing_status: "お支払い",
};

export const NOTIFICATION_TYPE_ICONS: Record<NotificationType, string> = {
  deadline_reminder: "⏰",
  deadline_near: "🔔",
  company_fetch: "🏢",
  es_review: "✨",
  daily_summary: "📋",
  calendar_sync_failed: "📅",
  billing_status: "💳",
};

export type { Notification, NotificationType, NotificationsResponse };

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

async function assertNotificationMutationOk(
  response: Response,
  fallback: typeof NOTIFICATIONS_FETCH_FALLBACK,
  context: string,
) {
  if (!response.ok) {
    throw await parseApiErrorResponse(response, fallback, context);
  }
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

        await assertNotificationMutationOk(response, NOTIFICATIONS_FETCH_FALLBACK, "useNotifications.markAsRead");

        return true;
      } catch (err) {
        await mutate(current, { revalidate: false });
        notifySwrUserFacingFailure(
          toAppUiError(err, NOTIFICATIONS_FETCH_FALLBACK, "useNotifications.markAsRead"),
          `/api/notifications/${notificationId}/read`,
        );
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

      await assertNotificationMutationOk(response, NOTIFICATIONS_FETCH_FALLBACK, "useNotifications.markAllAsRead");

      return true;
    } catch (err) {
      await mutate(current, { revalidate: false });
      notifySwrUserFacingFailure(
        toAppUiError(err, NOTIFICATIONS_FETCH_FALLBACK, "useNotifications.markAllAsRead"),
        "/api/notifications/read-all",
      );
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

        await assertNotificationMutationOk(response, NOTIFICATIONS_FETCH_FALLBACK, "useNotifications.deleteNotification");

        return true;
      } catch (err) {
        await mutate(current, { revalidate: false });
        notifySwrUserFacingFailure(
          toAppUiError(err, NOTIFICATIONS_FETCH_FALLBACK, "useNotifications.deleteNotification"),
          `/api/notifications/${notificationId}`,
        );
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

      await assertNotificationMutationOk(response, NOTIFICATIONS_FETCH_FALLBACK, "useNotifications.deleteAllNotifications");

      return true;
    } catch (err) {
      await mutate(current, { revalidate: false });
      notifySwrUserFacingFailure(
        toAppUiError(err, NOTIFICATIONS_FETCH_FALLBACK, "useNotifications.deleteAllNotifications"),
        "/api/notifications/delete",
      );
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
