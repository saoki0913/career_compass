import fs from "node:fs/promises";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { mockAuthenticatedUser, mockCredits } from "../fixtures/auth";
import {
  ES_EDITOR_UI_REVIEW_DOCUMENT_ID,
  mockEsEditorUiReviewApis,
} from "./es-editor-fixtures";

const screenshotDir = path.join(process.cwd(), "test-results", "es-editor-ui-smoke");
const routePath = `/es/${ES_EDITOR_UI_REVIEW_DOCUMENT_ID}`;

const viewports = [
  { height: 844, name: "mobile-390", width: 390 },
  { height: 1180, name: "tablet-820", width: 820 },
  { height: 900, name: "desktop-1100", width: 1100 },
  { height: 900, name: "desktop-1200", width: 1200 },
  { height: 900, name: "desktop-1440", width: 1440 },
] as const;

async function setupEsEditor(page: Page) {
  await mockAuthenticatedUser(page, {
    id: "ui-review-user",
    name: "UI Review User",
    email: "ui-review@example.com",
    plan: "standard",
  });
  await mockCredits(page, {
    type: "user",
    plan: "standard",
    balance: 120,
  });
  await page.route("**/api/notifications**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ notifications: [], unreadCount: 0 }),
    });
  });
  await mockEsEditorUiReviewApis(page);
}

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => ({
    body: Math.max(document.body.scrollWidth, document.documentElement.scrollWidth),
    viewport: window.innerWidth,
  }));
  expect(overflow.body).toBeLessThanOrEqual(overflow.viewport + 2);
}

async function expectNoBoxOverlap(page: Page, firstSelector: string, secondSelector: string) {
  const boxes = await page.evaluate(
    ({ first, second }) => {
      const a = document.querySelector(first)?.getBoundingClientRect();
      const b = document.querySelector(second)?.getBoundingClientRect();
      if (!a || !b) return null;
      return {
        separated: a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top,
      };
    },
    { first: firstSelector, second: secondSelector },
  );
  expect(boxes?.separated).toBe(true);
}

async function capture(page: Page, name: string) {
  await fs.mkdir(screenshotDir, { recursive: true });
  await page.screenshot({
    path: path.join(screenshotDir, `${name}.png`),
    fullPage: true,
  });
}

for (const viewport of viewports) {
  test(`ES詳細UIの基本レイアウト ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize({ height: viewport.height, width: viewport.width });
    await setupEsEditor(page);
    await page.goto(routePath, { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("es-editor-shell")).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('input[type="text"]').first()).toHaveValue("三菱商事 志望動機");
    await expect(page.getByRole("button", { name: "この設問をAI添削" }).first()).toBeVisible();
    await expectNoHorizontalOverflow(page);

    if (viewport.width < 1024) {
      await expect(page.getByTestId("mobile-sidebar-toggle")).toBeVisible();
      await expectNoBoxOverlap(page, '[data-testid="mobile-sidebar-toggle"]', '[data-testid="es-editor-shell"] main');
    } else {
      await expect(page.getByTestId("es-review-desktop-panel")).toBeVisible();
    }

    await capture(page, `layout-${viewport.name}`);
  });
}

test("ES添削パネルの入力不足、実行、結果表示を確認する", async ({ page }) => {
  await page.setViewportSize({ height: 900, width: 1440 });
  await setupEsEditor(page);
  await page.goto(routePath, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "この設問をAI添削" }).first().click();
  await expect(page.getByText("対象設問")).toBeVisible();
  await expect(page.getByTestId("es-review-action-footer")).toBeVisible();

  await page.getByTestId("es-review-action-footer").getByRole("button", { name: "この設問をAI添削" }).click();
  await expect(page.getByText("先に職種を選択してください。").first()).toBeVisible();

  await page.getByText("職種を選択してください").last().click();
  await page.getByRole("option", { name: "総合職" }).click();
  await page.getByTestId("es-review-action-footer").getByRole("button", { name: "この設問をAI添削" }).click();

  await expect(page.getByText("添削完了")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("button", { name: "この改善案を反映" })).toBeVisible();
  await expect(page.getByText("出典リンク")).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await capture(page, "review-result-desktop-1440");
});

test("モバイル下部シートで対象設問と実行バーが切れない", async ({ page }) => {
  await page.setViewportSize({ height: 844, width: 390 });
  await setupEsEditor(page);
  await page.goto(routePath, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "この設問をAI添削" }).first().click();
  await expect(page.getByTestId("es-review-mobile-sheet")).toBeVisible();
  await expect(page.getByText("対象設問")).toBeVisible();
  await expect(page.getByTestId("es-review-action-footer")).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await capture(page, "review-sheet-mobile-390");
});
