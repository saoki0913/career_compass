import { expect, test } from "@playwright/test";
import {
  clearGuestSession,
  getDeviceToken,
  hasDeviceToken,
  loginAsGuest,
  navigateTo,
} from "./fixtures/auth";

test.describe("Auth boundary contracts", () => {
  test("guest session persists across refresh and tabs", async ({ page, context }) => {
    test.setTimeout(90_000);
    const token = await loginAsGuest(page);
    await navigateTo(page, "/dashboard");
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForLoadState("domcontentloaded");
    await expect(page.locator("main")).toBeVisible();
    expect(await getDeviceToken(page)).toBe(token);

    const secondPage = await context.newPage();
    await secondPage.goto("/");
    await secondPage.evaluate(([key, value]) => {
      localStorage.setItem(key, value);
    }, ["ukarun_device_token", token]);
    await navigateTo(secondPage, "/companies");
    expect(await getDeviceToken(secondPage)).toBe(token);
    await secondPage.close();
  });

  test("guest is redirected or blocked from authenticated-only pages", async ({ page }) => {
    await loginAsGuest(page);

    await page.goto("/settings");
    await page.waitForTimeout(1000);
    expect(
      page.url().includes("/login") ||
        (await page.getByText(/ログイン|認証/i).first().isVisible().catch(() => false))
    ).toBeTruthy();

    await page.goto("/calendar/settings");
    await page.waitForTimeout(1000);
    expect(
      page.url().includes("/login") ||
        (await page.getByText(/ログイン|認証/i).first().isVisible().catch(() => false))
    ).toBeTruthy();
  });

  test("guest session can be cleared explicitly", async ({ page }) => {
    await loginAsGuest(page);
    expect(await hasDeviceToken(page)).toBe(true);
    await clearGuestSession(page);
    expect(await hasDeviceToken(page)).toBe(false);
  });
});
