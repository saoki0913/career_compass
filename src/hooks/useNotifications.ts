/**
 * Notifications Hook
 *
 * Manages notifications for the user
 */

import { useState, useEffect, useCallback } from "react";
import { getDeviceToken } from "@/lib/auth/device-token";

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

function buildHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (typeof window !== "undefined") {
    try {
      const deviceToken = getDeviceToken();
      if (deviceToken) {
        headers["x-device-token"] = deviceToken;
      }
    } catch {
      // Ignore errors
    }
  }
  return headers;
}

export interface UseNotificationsOptions {
  limit?: number;
  unreadOnly?: boolean;
}

export function useNotifications(options: UseNotificationsOptions = {}) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchNotifications = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (options.limit) params.set("limit", options.limit.toString());
      if (options.unreadOnly) params.set("unreadOnly", "true");

      const url = `/api/notifications${params.toString() ? `?${params.toString()}` : ""}`;
      const response = await fetch(url, {
        headers: buildHeaders(),
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error("Failed to fetch notifications");
      }

      const data = await response.json();
      setNotifications(data.notifications || []);
      setUnreadCount(data.unreadCount || 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "通知の取得に失敗しました");
    } finally {
      setIsLoading(false);
    }
  }, [options.limit, options.unreadOnly]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  const markAsRead = useCallback(
    async (notificationId: string): Promise<boolean> => {
      try {
        const response = await fetch(`/api/notifications/${notificationId}/read`, {
          method: "POST",
          headers: buildHeaders(),
          credentials: "include",
        });

        if (!response.ok) {
          throw new Error("Failed to mark notification as read");
        }

        // Update local state
        setNotifications((prev) =>
          prev.map((n) => (n.id === notificationId ? { ...n, isRead: true } : n))
        );
        setUnreadCount((prev) => Math.max(0, prev - 1));

        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : "通知の既読処理に失敗しました");
        return false;
      }
    },
    []
  );

  const markAllAsRead = useCallback(async (): Promise<boolean> => {
    try {
      const response = await fetch("/api/notifications/read-all", {
        method: "POST",
        headers: buildHeaders(),
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error("Failed to mark all notifications as read");
      }

      // Update local state
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      setUnreadCount(0);

      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "通知の既読処理に失敗しました");
      return false;
    }
  }, []);

  const deleteNotification = useCallback(
    async (notificationId: string): Promise<boolean> => {
      try {
        const response = await fetch(`/api/notifications/${notificationId}`, {
          method: "DELETE",
          headers: buildHeaders(),
          credentials: "include",
        });

        if (!response.ok) {
          throw new Error("Failed to delete notification");
        }

        setNotifications((prev) => {
          const removed = prev.find((n) => n.id === notificationId);
          if (removed && !removed.isRead) {
            setUnreadCount((c) => Math.max(0, c - 1));
          }
          return prev.filter((n) => n.id !== notificationId);
        });

        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : "通知の削除に失敗しました");
        return false;
      }
    },
    []
  );

  const deleteAllNotifications = useCallback(async (): Promise<boolean> => {
    try {
      const response = await fetch("/api/notifications/delete", {
        method: "POST",
        headers: buildHeaders(),
        credentials: "include",
        body: JSON.stringify({ all: true }),
      });

      if (!response.ok) {
        throw new Error("Failed to delete all notifications");
      }

      setNotifications([]);
      setUnreadCount(0);

      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "通知の削除に失敗しました");
      return false;
    }
  }, []);

  return {
    notifications,
    unreadCount,
    isLoading,
    error,
    refresh: fetchNotifications,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    deleteAllNotifications,
  };
}
