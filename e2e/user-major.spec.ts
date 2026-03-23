import { expect, test } from "@playwright/test";
import {
  createOwnedCompany,
  createOwnedNotification,
  createOwnedTask,
  deleteGuestCompany,
  deleteOwnedNotification,
  deleteOwnedTask,
} from "./fixtures/auth";
import { hasGoogleAuthState, signInWithGoogle } from "./google-auth";

test.describe("User major flow", () => {
  test.skip(!hasGoogleAuthState, "Google auth storage state is not configured");

  test("logged-in user can access authenticated core surfaces", async ({ page }) => {
    test.setTimeout(90_000);

    const runId = `user-major-${Date.now()}`;
    const companyName = `ログイン主要導線会社_${runId}`;
    const notificationTitle = `ログイン通知_${runId}`;
    const taskTitle = `ログインタスク_${runId}`;

    let companyId: string | null = null;
    let taskId: string | null = null;
    let notificationId: string | null = null;

    try {
      await signInWithGoogle(page, "/dashboard");
      await expect(page.locator("main")).toBeVisible();

      const company = await createOwnedCompany(page, {
        name: companyName,
        industry: "IT・ソフトウェア",
      });
      companyId = company.id;

      const task = await createOwnedTask(page, {
        title: taskTitle,
        type: "other",
        companyId,
        dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      });
      taskId = task.id;

      const notification = await createOwnedNotification(page, {
        type: "daily_summary",
        title: notificationTitle,
        message: `${companyName} の進捗を確認してください`,
      });
      notificationId = notification.id;

      await page.goto("/notifications");
      await expect(page.locator("main")).toBeVisible();
      await expect(page.locator("body")).toContainText(notificationTitle);

      await page.goto(`/search?q=${encodeURIComponent(runId)}`);
      await expect(page.locator("main")).toBeVisible();
      await expect(page.locator("body")).toContainText(companyName);

      await page.goto("/calendar");
      await expect(page.locator("main")).toBeVisible();

      await page.goto("/calendar/settings");
      await expect(page.locator("main")).toBeVisible();
      await expect(page.locator("body")).toContainText(/カレンダー|Google/);

      await page.goto("/settings");
      await expect(page.locator("main")).toBeVisible();
      await expect(page.locator("body")).toContainText(/設定|通知/);

      await page.goto("/profile");
      await expect(page.locator("main")).toBeVisible();
      await expect(page.locator("body")).toContainText(/プロフィール/);

      await page.goto("/tasks");
      await expect(page.locator("body")).toContainText(taskTitle);
    } finally {
      if (notificationId) {
        await deleteOwnedNotification(page, notificationId);
      }
      if (taskId) {
        await deleteOwnedTask(page, taskId);
      }
      if (companyId) {
        await deleteGuestCompany(page, companyId);
      }
    }
  });
});
