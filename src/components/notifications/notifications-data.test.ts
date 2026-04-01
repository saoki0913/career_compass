import { describe, expect, it } from "vitest";

import { buildNotificationPreviewData } from "@/components/notifications/notifications-data";

describe("buildNotificationPreviewData", () => {
  it("keeps unread count and trims notifications to the requested preview size", () => {
    const result = buildNotificationPreviewData(
      {
        notifications: [
          {
            id: "n1",
            userId: "user-1",
            guestId: null,
            type: "daily_summary",
            title: "A",
            message: "A",
            data: null,
            isRead: false,
            createdAt: "2026-03-27T00:00:00.000Z",
            expiresAt: null,
          },
          {
            id: "n2",
            userId: "user-1",
            guestId: null,
            type: "daily_summary",
            title: "B",
            message: "B",
            data: null,
            isRead: true,
            createdAt: "2026-03-27T01:00:00.000Z",
            expiresAt: null,
          },
          {
            id: "n3",
            userId: "user-1",
            guestId: null,
            type: "daily_summary",
            title: "C",
            message: "C",
            data: null,
            isRead: true,
            createdAt: "2026-03-27T02:00:00.000Z",
            expiresAt: null,
          },
        ],
        unreadCount: 7,
      },
      2
    );

    expect(result.unreadCount).toBe(7);
    expect(result.notifications).toHaveLength(2);
    expect(result.notifications[0]?.id).toBe("n1");
    expect(result.notifications[1]?.id).toBe("n2");
  });
});
