import { expect, test } from "@playwright/test";
import {
  createOwnedCompany,
  createOwnedTask,
  deleteGuestCompany,
  deleteOwnedTask,
} from "./fixtures/auth";
import { hasAuthenticatedUserAccess, signInAsAuthenticatedUser } from "./google-auth";

test.describe("Dashboard today task card layout", () => {
  test.skip(!hasAuthenticatedUserAccess, "Authenticated E2E access is not configured");

  test("compact card shows full task row without vertical clipping", async ({ page }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: 1280, height: 720 });

    const runId = `dash-tt-${Date.now()}`;
    const longCompanyName = `東京海上日動火災保険株式会社_${runId}`;
    const taskTitle = `ES作成_${runId}_タスクタイトル表示確認`;

    let companyId: string | null = null;
    let taskId: string | null = null;

    try {
      await signInAsAuthenticatedUser(page, "/dashboard");

      const company = await createOwnedCompany(page, {
        name: longCompanyName,
        industry: "保険",
      });
      companyId = company.id;

      const task = await createOwnedTask(page, {
        title: taskTitle,
        type: "es",
        companyId,
        dueDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
      });
      taskId = task.id;

      await page.goto("/dashboard", { waitUntil: "networkidle" });

      const card = page.getByTestId("dashboard-today-task-card");
      await expect(card).toBeVisible({ timeout: 30_000 });
      await expect(card).toContainText("今日の最重要タスク");
      await expect(card).toContainText(longCompanyName);
      await expect(card.getByText(taskTitle, { exact: true })).toBeVisible();

      const { scrollHeight, clientHeight } = await card.evaluate((el) => ({
        scrollHeight: el.scrollHeight,
        clientHeight: el.clientHeight,
      }));
      expect(
        scrollHeight,
        `card content must fit: scrollHeight=${scrollHeight} clientHeight=${clientHeight}`,
      ).toBeLessThanOrEqual(clientHeight + 3);

      const cardBox = await card.boundingBox();
      const titleLoc = card.getByText(taskTitle, { exact: true });
      const titleBox = await titleLoc.boundingBox();
      expect(cardBox).toBeTruthy();
      expect(titleBox).toBeTruthy();
      if (cardBox && titleBox) {
        expect(
          titleBox.y + titleBox.height,
          "task title must not extend below card bottom",
        ).toBeLessThanOrEqual(cardBox.y + cardBox.height + 2);
      }
    } finally {
      if (taskId) {
        await deleteOwnedTask(page, taskId);
      }
      if (companyId) {
        await deleteGuestCompany(page, companyId);
      }
    }
  });
});
