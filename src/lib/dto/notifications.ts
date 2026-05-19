export type NotificationType =
  | "deadline_reminder"
  | "deadline_near"
  | "company_fetch"
  | "es_review"
  | "daily_summary"
  | "calendar_sync_failed"
  | "billing_status";

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  data: Record<string, unknown> | null;
  isRead: boolean;
  createdAt: string;
  expiresAt: string | null;
}

export interface NotificationsResponse {
  notifications: Notification[];
  unreadCount: number;
}
