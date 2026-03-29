import { expect, test } from "@playwright/test";
import { hasGoogleAuthState, signInWithGoogle } from "./google-auth";

const productionCompanyId = process.env.E2E_PRODUCTION_COMPANY_ID?.trim();

test.describe("Production release smoke", () => {
  test("public surfaces are reachable", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("body")).toContainText(/就活|ES|ガクチカ|志望動機/);

    await page.goto("/pricing");
    await expect(page.locator("main")).toBeVisible();

    await page.goto("/terms");
    await expect(page.locator("main")).toBeVisible();

    await page.goto("/privacy");
    await expect(page.locator("main")).toBeVisible();
  });

  test("authenticated read-only surfaces load when auth state exists", async ({ page }) => {
    test.skip(!hasGoogleAuthState, "Google auth storage state is not configured");

    await signInWithGoogle(page, "/dashboard");
    await expect(page.locator("main")).toBeVisible();

    await page.goto("/companies");
    await expect(page.locator("main")).toBeVisible();

    await page.goto("/tasks");
    await expect(page.locator("main")).toBeVisible();

    await page.goto("/search?q=就活");
    await expect(page.locator("main")).toBeVisible();

    await page.goto("/settings");
    await expect(page.locator("main")).toBeVisible();

    await page.goto("/profile");
    await expect(page.locator("main")).toBeVisible();
  });

  test("company detail loads when E2E_PRODUCTION_COMPANY_ID is set", async ({ page }) => {
    test.skip(
      !hasGoogleAuthState || !productionCompanyId,
      "Set PLAYWRIGHT_AUTH_STATE and E2E_PRODUCTION_COMPANY_ID to cover /companies/[id] SSR + DB"
    );

    await signInWithGoogle(page, "/dashboard");
    await page.goto(`/companies/${productionCompanyId}`, { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(new RegExp(`/companies/${productionCompanyId}`));
    await expect(page.locator("main")).toBeVisible({ timeout: 20_000 });
    await expect(page.locator("body")).not.toContainText(/This page couldn.t load|server error occurred/i);
  });
});
