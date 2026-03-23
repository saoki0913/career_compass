import { expect, test } from "@playwright/test";
import { hasGoogleAuthState, signInWithGoogle } from "./google-auth";

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
});
