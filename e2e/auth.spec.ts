import { expect, test } from "@playwright/test";
import { ensureGuestSession, loginAsGuest, navigateTo } from "./fixtures/auth";

test.describe("Auth smoke", () => {
  test("guest can enter dashboard and stays blocked from authenticated-only settings", async ({ page }) => {
    await loginAsGuest(page);
    await ensureGuestSession(page);

    await navigateTo(page, "/dashboard");
    await expect(page.locator("main").first()).toBeVisible();

    await page.goto("/settings");
    await page.waitForTimeout(1000);
    expect(
      page.url().includes("/login") ||
        (await page.getByText(/ログイン|認証/i).first().isVisible().catch(() => false))
    ).toBeTruthy();
  });
});
