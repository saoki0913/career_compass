import { expect, test } from "@playwright/test";
import {
  clearGuestSession,
  ensureGuestSession,
  getDeviceToken,
  hasDeviceToken,
  loginAsGuest,
  navigateTo,
} from "../fixtures/auth";

test.describe("Auth boundary contracts", () => {
  test("guest session persists across refresh and tabs", async ({ page, context }) => {
    test.setTimeout(90_000);
    const token = await loginAsGuest(page);
    await ensureGuestSession(page);
    await navigateTo(page, "/dashboard");
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForLoadState("domcontentloaded");
    await expect(page.locator("main").first()).toBeVisible();
    expect(await getDeviceToken(page)).toBe(token);

    const secondPage = await context.newPage();
    await secondPage.goto("/");
    await ensureGuestSession(secondPage);
    await navigateTo(secondPage, "/companies");
    expect(await getDeviceToken(secondPage)).toBe(token);
    await secondPage.close();
  });

  test("guest is redirected or blocked from authenticated-only pages", async ({ page }) => {
    await loginAsGuest(page);
    await ensureGuestSession(page);

    await page.goto("/settings");
    await page.waitForLoadState("domcontentloaded");
    const settingsBlocked =
      page.url().includes("/login") ||
      (await page.getByText(/ログイン|認証/i).first().isVisible({ timeout: 5_000 }).catch(() => false));
    expect(settingsBlocked, `Expected /settings to redirect or show auth gate, got: ${page.url()}`).toBe(true);

    await page.goto("/calendar/settings");
    await page.waitForLoadState("domcontentloaded");
    const calendarSettingsBlocked =
      page.url().includes("/login") ||
      (await page.getByText(/ログイン|認証/i).first().isVisible({ timeout: 5_000 }).catch(() => false));
    expect(calendarSettingsBlocked, `Expected /calendar/settings to redirect or show auth gate, got: ${page.url()}`).toBe(true);
  });

  test("guest session can be cleared explicitly", async ({ page }) => {
    await loginAsGuest(page);
    expect(await hasDeviceToken(page)).toBe(true);
    await clearGuestSession(page);
    expect(await hasDeviceToken(page)).toBe(false);
  });
});
