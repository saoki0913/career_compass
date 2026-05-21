import { expect, test, type Page } from "@playwright/test";
import {
  mockAuthenticatedUser,
  mockCredits,
  mockUnauthenticated,
} from "../fixtures/auth";
import {
  mockInterviewData,
  mockInterviewRoleOptions,
  type RoleOptionsVariant,
} from "../mocks/interview";

/**
 * 面接設定の職種選択（RoleSelector）の回帰テスト。
 *
 * 根治した不具合: `/api/companies/[id]/es-role-options` が業界不明時に空の roleGroups を
 * 返し、面接設定で職種候補が出てこなかった。修正後は常に非空の候補（業界別 or 汎用セット）
 * + `isFallback`/`fallbackReason` を返し、UI は「候補から選択 / 自由入力」を切り替えられる。
 */

const COMPANY_ID = "interview-role-company";

async function mockShellApis(page: Page): Promise<void> {
  await page.route("**/api/notifications**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ notifications: [], unreadCount: 0 }),
    });
  });
  // 認証確定に必要: /api/auth/plan が 401 だと AuthProvider が session を rejected 扱いにし、
  // isAuthenticated=false となって面接ページがログイン要求にフォールバックする。
  await page.route("**/api/auth/plan", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        plan: "standard",
        planSelectedAt: "2026-01-01T00:00:00.000Z",
        needsPlanSelection: false,
        onboardingCompleted: true,
        needsOnboarding: false,
        hasActiveSubscription: true,
        subscriptionStatus: "active",
      }),
    });
  });
  await page.route(`**/api/companies/${COMPANY_ID}`, async (route) => {
    if (route.request().method() !== "GET") {
      return route.continue();
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        company: { id: COMPANY_ID, name: "株式会社テスト", industry: "IT・通信" },
      }),
    });
  });
}

async function setupAuthenticatedInterview(
  page: Page,
  variant: RoleOptionsVariant,
): Promise<void> {
  await mockAuthenticatedUser(page, {
    id: "user-e2e",
    name: "E2E User",
    email: "e2e@example.com",
    plan: "standard",
  });
  await mockCredits(page, { balance: 100, plan: "standard" });
  await mockShellApis(page);
  await mockInterviewRoleOptions(page, COMPANY_ID, variant);
  await mockInterviewData(page, COMPANY_ID);
}

async function gotoInterview(page: Page): Promise<void> {
  await page.goto(`/companies/${COMPANY_ID}/interview`);
  // 設定カードの職種ブロックが描画されるまで待つ。
  await expect(page.getByRole("tab", { name: "候補から選択" })).toBeVisible({
    timeout: 15_000,
  });
}

const fallbackBanner =
  "業界が未設定のため汎用職種を表示しています。該当する職種がなければ自由入力してください。";

test.describe("面接設定の職種選択 (authenticated)", () => {
  test("業界未設定でも汎用候補と fallback 注記が表示される", async ({ page }) => {
    await setupAuthenticatedInterview(page, "generic_only");
    await gotoInterview(page);

    // fallback メタが UI に伝播している。
    await expect(
      page.locator('[data-fallback-reason="industry_unresolved"]'),
    ).toBeVisible();
    await expect(page.getByText(fallbackBanner)).toBeVisible();

    // 汎用候補が選択肢として存在する。
    await page.getByRole("combobox", { name: "職種候補" }).click();
    await expect(page.getByRole("option", { name: "総合職" })).toBeVisible();
  });

  test("業界設定済みでは業界別候補が出て fallback 注記は出ない", async ({ page }) => {
    await setupAuthenticatedInterview(page, "with_industry");
    await gotoInterview(page);

    await expect(
      page.locator('[data-fallback-reason="industry_unresolved"]'),
    ).toHaveCount(0);
    await expect(page.getByText(fallbackBanner)).toHaveCount(0);

    await page.getByRole("combobox", { name: "職種候補" }).click();
    await expect(page.getByRole("option", { name: "エンジニア", exact: true })).toBeVisible();
  });

  test("自由入力タブに切り替えると入力欄が現れ値が反映される", async ({ page }) => {
    await setupAuthenticatedInterview(page, "with_industry");
    await gotoInterview(page);

    // 候補モードでは自由入力欄は出ていない。
    await expect(
      page.getByRole("textbox", { name: "職種を自由入力" }),
    ).toHaveCount(0);

    await page.getByRole("tab", { name: "自由入力" }).click();
    const input = page.getByRole("textbox", { name: "職種を自由入力" });
    await expect(input).toBeVisible();

    await input.fill("カスタム職種");
    await expect(input).toHaveValue("カスタム職種");
  });

  test("候補を選択するとサイドバーに職種バッジが反映される", async ({ page }) => {
    await setupAuthenticatedInterview(page, "with_industry");
    await gotoInterview(page);

    await page.getByRole("combobox", { name: "職種候補" }).click();
    await page.getByRole("option", { name: "企画職", exact: true }).click();

    // 選択した職種は設定サマリとサイドバーバッジの複数箇所に反映されるため first() で判定。
    await expect(page.getByText("職種: 企画職").first()).toBeVisible();
  });

  test("API エラー時も UI は壊れず自由入力で続行できる", async ({ page }) => {
    await setupAuthenticatedInterview(page, "api_error");
    await gotoInterview(page);

    // 候補は空でも、自由入力に切り替えて入力できる（行き止まりにならない）。
    await page.getByRole("tab", { name: "自由入力" }).click();
    const input = page.getByRole("textbox", { name: "職種を自由入力" });
    await expect(input).toBeVisible();
    await input.fill("自由入力職種");
    await expect(input).toHaveValue("自由入力職種");
  });

  test("応募中の職種が候補にマージされる", async ({ page }) => {
    await setupAuthenticatedInterview(page, "with_applications");
    await gotoInterview(page);

    await page.getByRole("combobox", { name: "職種候補" }).click();
    await expect(
      page.getByRole("option", { name: "プロダクトマネージャー" }),
    ).toBeVisible();
  });

  test("ESに紐づく職種が候補に含まれる", async ({ page }) => {
    await setupAuthenticatedInterview(page, "with_document");
    await gotoInterview(page);

    await page.getByRole("combobox", { name: "職種候補" }).click();
    await expect(
      page.getByRole("option", { name: "データサイエンティスト" }),
    ).toBeVisible();
  });
});

test.describe("面接設定の職種選択 (guest)", () => {
  test("ゲストはログイン要求が表示され設定に到達しない", async ({ page }) => {
    await mockUnauthenticated(page);
    await mockShellApis(page);
    await page.goto(`/companies/${COMPANY_ID}/interview`);

    await expect(page.getByText("AI模擬面接で面接対策")).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole("tab", { name: "候補から選択" })).toHaveCount(0);
  });
});
