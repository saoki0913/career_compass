import { expect, test } from "@playwright/test";

test.describe("Home smoke", () => {
  test("marketing home and login entry render", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });

    await expect(page.locator("main").first()).toBeVisible();
    await expect(page.getByRole("heading", { name: /就活の不安を/ })).toBeVisible();
    await expect(page.getByRole("link", { name: "無料で始める" }).first()).toBeVisible();

    await page.goto("/login", { waitUntil: "domcontentloaded" });
    await expect(page.locator("main").first()).toBeVisible();
    await expect(page.locator("body")).toContainText(/ログイン|Google/);
  });
});
