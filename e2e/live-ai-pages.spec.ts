import { expect, test } from "@playwright/test";
import { hasAuthenticatedUserAccess, signInAsAuthenticatedUser } from "./google-auth";

const PAGES = [
  { path: "/dashboard", label: "ダッシュボード" },
  { path: "/companies", label: "企業一覧" },
  { path: "/es", label: "ES一覧" },
  { path: "/gakuchika", label: "ガクチカ一覧" },
  { path: "/calendar", label: "カレンダー" },
  { path: "/notifications", label: "通知" },
  { path: "/settings", label: "設定" },
] as const;

test.describe("Product pages render check", () => {
  for (const { path, label } of PAGES) {
    test(`${label} (${path}) renders without error`, async ({ page }) => {
      test.skip(!hasAuthenticatedUserAccess, "Auth required");
      test.setTimeout(30_000);
      await signInAsAuthenticatedUser(page, path);
      await expect(page.locator("main")).toBeVisible({ timeout: 10_000 });
      const bodyText = await page.locator("body").textContent();
      expect(bodyText).not.toContain("Application error");
      expect(bodyText).not.toContain("500");
    });
  }
});
