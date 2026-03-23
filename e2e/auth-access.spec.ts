import { expect, test } from "@playwright/test";
import {
  clearGuestSession,
  getDeviceToken,
  hasDeviceToken,
  loginAsGuest,
  navigateTo,
} from "./fixtures/auth";
import { hasGoogleAuthState, signInWithGoogle } from "./google-auth";

test.describe("Auth and access contracts", () => {
  test("guest session persists across refresh and tabs", async ({ page, context }) => {
    const token = await loginAsGuest(page);
    await navigateTo(page, "/dashboard");
    await page.reload();
    await page.waitForLoadState("networkidle");
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

  test("logged-in auth state can reach authenticated pages", async ({ page }) => {
    test.skip(!hasGoogleAuthState, "Google auth storage state is not configured");
    await signInWithGoogle(page, "/dashboard");
    await page.goto("/settings");
    await expect(page.locator("main")).toBeVisible();
    await page.goto("/profile");
    await expect(page.locator("main")).toBeVisible();
  });
});
