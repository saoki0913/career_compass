import { test, expect } from "@playwright/test";
import {
  loginAsGuest,
  ensureGuestSession,
  navigateTo,
} from "../fixtures/auth";
import { hasAuthenticatedUserAccess, signInAsAuthenticatedUser } from "../google-auth";

test.describe("Interview dashboard (guest)", () => {
  test("shows login required message", async ({ page }) => {
    await loginAsGuest(page);
    await ensureGuestSession(page);
    await navigateTo(page, "/interview/dashboard");

    await expect(
      page.getByText("成長ダッシュボードはログイン後に利用できます"),
    ).toBeVisible();
  });
});

test.describe("Interview dashboard (authenticated)", () => {
  test("renders dashboard structure with all 4 sections", async ({ page }) => {
    test.skip(!hasAuthenticatedUserAccess, "Requires CI_E2E_AUTH_SECRET or Google auth state");
    test.setTimeout(60_000);
    await signInAsAuthenticatedUser(page, "/interview/dashboard");

    await expect(page.getByText("面接 成長ダッシュボード")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("7 軸スコア推移")).toBeVisible();
    await expect(page.getByText("企業別 平均スコア")).toBeVisible();
    await expect(page.getByText("面接方式別 平均スコア")).toBeVisible();
    await expect(
      page.getByText("直近 3 セッションの頻出 キーワード"),
    ).toBeVisible();
  });

  test("shows session count and companies link", async ({ page }) => {
    test.skip(!hasAuthenticatedUserAccess, "Requires CI_E2E_AUTH_SECRET or Google auth state");
    test.setTimeout(60_000);
    await signInAsAuthenticatedUser(page, "/interview/dashboard");

    await expect(page.getByText("集計セッション数:")).toBeVisible({ timeout: 10_000 });
    await expect(
      page.getByText("企業一覧から面接対策を開始する"),
    ).toBeVisible();
  });
});
