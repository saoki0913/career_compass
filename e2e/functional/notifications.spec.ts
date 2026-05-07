import { expect, test } from "@playwright/test";
import {
  apiRequest,
  createGuestNotification,
  createOwnedNotification,
  deleteGuestNotification,
  deleteOwnedNotification,
  ensureGuestSession,
  loginAsGuest,
  navigateTo,
} from "../fixtures/auth";
import { hasAuthenticatedUserAccess, signInAsAuthenticatedUser } from "../google-auth";

test.describe("Notifications (guest)", () => {
  test("guest can list own notifications", async ({ page }) => {
    test.setTimeout(60_000);
    await loginAsGuest(page);
    await ensureGuestSession(page);

    const runId = `notif-g-${Date.now()}`;
    let notifId: string | null = null;

    try {
      const notif = await createGuestNotification(page, {
        type: "deadline_reminder",
        title: `締切リマインダー_${runId}`,
        message: "テスト通知メッセージ",
      });
      notifId = notif.id;

      const listRes = await apiRequest(page, "GET", "/api/notifications");
      expect(listRes.ok()).toBe(true);
      const body = (await listRes.json()) as { notifications: Array<{ id: string; title: string }> };
      expect(body.notifications.some((n) => n.id === notifId)).toBe(true);
    } finally {
      if (notifId) await deleteGuestNotification(page, notifId);
    }
  });

  test("guest can mark notification as read", async ({ page }) => {
    test.setTimeout(60_000);
    await loginAsGuest(page);
    await ensureGuestSession(page);

    const runId = `notif-read-${Date.now()}`;
    let notifId: string | null = null;

    try {
      const notif = await createGuestNotification(page, {
        type: "es_review",
        title: `ES添削完了_${runId}`,
        message: "添削が完了しました",
      });
      notifId = notif.id;

      const markRes = await apiRequest(page, "PATCH", `/api/notifications/${notifId}`, {
        read: true,
      });
      expect(markRes.ok()).toBe(true);

      const listRes = await apiRequest(page, "GET", "/api/notifications");
      const body = (await listRes.json()) as {
        notifications: Array<{ id: string; read: boolean }>;
      };
      const updated = body.notifications.find((n) => n.id === notifId);
      expect(updated?.read).toBe(true);
    } finally {
      if (notifId) await deleteGuestNotification(page, notifId);
    }
  });

  test("guest sees empty state when no notifications", async ({ page }) => {
    test.setTimeout(60_000);
    await loginAsGuest(page);
    await ensureGuestSession(page);

    await navigateTo(page, "/notifications");
    await expect(
      page.getByText(/通知はまだありません|通知がありません/i).first(),
    ).toBeVisible({ timeout: 15_000 });
  });
});

test.describe("Notifications (authenticated)", () => {
  test.skip(!hasAuthenticatedUserAccess, "Authenticated E2E access is not configured");

  test("authenticated user can list and mark notifications as read", async ({ page }) => {
    test.setTimeout(90_000);
    const runId = `notif-auth-${Date.now()}`;
    let notifId: string | null = null;

    try {
      await signInAsAuthenticatedUser(page, "/notifications");

      const notif = await createOwnedNotification(page, {
        type: "company_fetch",
        title: `企業情報取得完了_${runId}`,
        message: "企業情報の取得が完了しました",
      });
      notifId = notif.id;

      await page.reload({ waitUntil: "domcontentloaded" });
      await expect(page.getByText(notif.title)).toBeVisible({ timeout: 15_000 });

      const markRes = await apiRequest(page, "PATCH", `/api/notifications/${notifId}`, {
        read: true,
      });
      expect(markRes.ok()).toBe(true);
    } finally {
      if (notifId) await deleteOwnedNotification(page, notifId);
    }
  });

  test("mark-all-read works", async ({ page }) => {
    test.setTimeout(90_000);
    const runId = `notif-batch-${Date.now()}`;
    const notifIds: string[] = [];

    try {
      await signInAsAuthenticatedUser(page, "/notifications");

      for (let i = 0; i < 3; i++) {
        const notif = await createOwnedNotification(page, {
          type: "deadline_near",
          title: `締切接近_${runId}_${i}`,
          message: `テスト通知 ${i}`,
        });
        notifIds.push(notif.id);
      }

      const readAllRes = await apiRequest(page, "POST", "/api/notifications/read-all");
      expect(readAllRes.ok()).toBe(true);

      const listRes = await apiRequest(page, "GET", "/api/notifications");
      const body = (await listRes.json()) as {
        notifications: Array<{ id: string; read: boolean }>;
      };
      for (const id of notifIds) {
        const n = body.notifications.find((x) => x.id === id);
        expect(n?.read).toBe(true);
      }
    } finally {
      for (const id of notifIds) {
        await deleteOwnedNotification(page, id);
      }
    }
  });
});

test.describe("Notifications (edge cases)", () => {
  test("PATCH non-existent notification returns 404", async ({ page }) => {
    test.setTimeout(30_000);
    await loginAsGuest(page);
    await ensureGuestSession(page);

    const res = await apiRequest(page, "PATCH", "/api/notifications/nonexistent-id-000", {
      read: true,
    });
    expect(res.status()).toBe(404);
  });
});
