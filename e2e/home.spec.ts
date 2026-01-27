import { test, expect } from "@playwright/test";

test("homepage loads successfully", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/Career Compass/);
});

test("homepage has main content", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("main")).toBeVisible();
});
