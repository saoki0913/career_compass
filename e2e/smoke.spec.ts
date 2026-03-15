import { expect, test } from "@playwright/test";
import { loginAsGuest, navigateTo } from "./fixtures/auth";

const allowWrites = process.env.PLAYWRIGHT_SMOKE_ALLOW_WRITES === "1";

test.describe("Release Smoke", () => {
  test("homepage renders", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/就活Pass/);
    await expect(page.locator("main")).toBeVisible();
  });

  test("login page renders login surface", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByAltText("就活Pass").first()).toBeVisible();
  });

  test("guest can open companies page", async ({ page }) => {
    await loginAsGuest(page);
    await navigateTo(page, "/companies");
    await expect(page.locator("main")).toBeVisible();
  });

  test("can register a company when write smoke is enabled", async ({ page }) => {
    test.skip(!allowWrites, "Write smoke is enabled only for local verification.");

    await loginAsGuest(page);
    await navigateTo(page, "/companies/new");

    const companyName = `release-smoke-${Date.now()}`;
    await page.fill('input[name="name"]', companyName);
    await page.click('button[type="submit"]');
    await page.waitForLoadState("networkidle");

    await expect(page.locator("body")).toContainText(companyName);
  });
});
