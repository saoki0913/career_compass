import { test, expect, type Page } from "@playwright/test";
import {
  loginAsGuest,
  ensureGuestSession,
  mockAuthenticatedUser,
  mockCredits,
} from "./fixtures/auth";

const COMPANY_ID = "motivation-test-company";

async function mockMotivationPage(page: Page) {
  await page.route(`**/api/companies/${COMPANY_ID}`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        company: {
          id: COMPANY_ID,
          name: "株式会社テスト",
          industry: "IT・通信",
        },
      }),
    });
  });

  await page.route(`**/api/companies/${COMPANY_ID}/es-role-options**`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        companyId: COMPANY_ID,
        companyName: "株式会社テスト",
        industry: "IT・通信",
        requiresIndustrySelection: false,
        industryOptions: ["IT・通信"],
        roleGroups: [
          {
            id: "default",
            label: "職種候補",
            options: [
              {
                value: "企画職",
                label: "企画職",
                source: "industry_default",
              },
            ],
          },
        ],
      }),
    });
  });

  await page.route(`**/api/motivation/${COMPANY_ID}/conversation`, async (route) => {
    if (route.request().method() !== "GET") {
      return route.continue();
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        messages: [
          {
            id: "assistant-1",
            role: "assistant",
            content: "株式会社テストの業務改革に惹かれた理由を1つ教えてください。",
          },
        ],
        nextQuestion: "株式会社テストの業務改革に惹かれた理由を1つ教えてください。",
        questionCount: 1,
        isCompleted: false,
        scores: {
          company_understanding: 42,
          self_analysis: 36,
          career_vision: 28,
          differentiation: 33,
        },
        suggestionOptions: [
          {
            id: "option-1",
            label: "業務改革を通じて顧客課題を解決できる点に惹かれたため",
            sourceType: "company",
            intent: "company_reason",
            rationale: "企業固有の特徴に直接触れる候補",
            isTentative: false,
          },
          {
            id: "option-2",
            label: "企画職として業務改革に関わり、価値を出せると感じたため",
            sourceType: "application_job_type",
            intent: "company_reason",
            rationale: "応募職種から企業志望理由へつなぐ候補",
            isTentative: false,
          },
        ],
        evidenceSummary: "新卒採用ページ: 業務改革とDX支援を推進",
        evidenceCards: [
          {
            sourceId: "S1",
            title: "新卒採用ページ",
            contentType: "new_grad_recruitment",
            excerpt: "業務改革とDX支援を通じて、顧客課題の解決に取り組む。",
            sourceUrl: "https://example.com/recruit",
            relevanceLabel: "新卒採用",
          },
        ],
        questionStage: "company_reason",
        stageStatus: {
          current: "company_reason",
          completed: [],
          pending: ["desired_work", "fit_connection", "differentiation", "closing"],
        },
        coachingFocus: "企業志望理由",
        conversationContext: {
          selectedIndustry: "IT・通信",
          selectedRole: "企画職",
          selectedRoleSource: "industry_default",
        },
        setup: {
          selectedIndustry: "IT・通信",
          selectedRole: "企画職",
          selectedRoleSource: "industry_default",
          requiresIndustrySelection: false,
          resolvedIndustry: "IT・通信",
          isComplete: true,
          requiresRestart: false,
          hasSavedConversation: true,
        },
      }),
    });
  });
}

async function mockMotivationShellApis(page: Page) {
  await page.route("**/api/notifications**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ notifications: [], unreadCount: 0 }),
    });
  });
}

test.describe("Motivation page (guest)", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsGuest(page);
    await ensureGuestSession(page);
  });

  test("shows login required for AI features", async ({ page }) => {
    await page.goto(`/companies/${COMPANY_ID}/motivation`);
    await expect(
      page.getByText("志望動機のAI支援はログイン後にご利用いただけます")
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "ログイン / 新規登録" })).toBeVisible();
  });
});

test.describe("Motivation page (mock authenticated)", () => {
  test.beforeEach(async ({ page }) => {
    await mockMotivationPage(page);
    await mockAuthenticatedUser(page, {
      id: "motivation-e2e-user",
      name: "E2E User",
      email: "e2e-motivation@example.com",
      plan: "free",
    });
    await mockCredits(page, { type: "user", plan: "free", balance: 100 });
    await mockMotivationShellApis(page);
  });

  test("desktop shows a single header CTA, visible restart button, and direct-answer options", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 960 });
    await page.goto(`/companies/${COMPANY_ID}/motivation`);

    const contentMain = page.getByRole("main").filter({ hasText: "志望動機を作成" });
    const mainBox = await contentMain.boundingBox();
    expect(mainBox).not.toBeNull();
    expect(mainBox?.width ?? 0).toBeGreaterThan(1200);

    await expect(page.getByRole("heading", { name: "志望動機を作成" })).toBeVisible();
    await expect(page.getByRole("button", { name: "志望動機ESを作成" })).toHaveCount(1);
    await expect(page.getByRole("button", { name: "志望動機ESを作成" })).toBeVisible();
    await expect(page.getByRole("button", { name: "会話をやり直す" }).first()).toBeVisible();
    await expect(page.getByText("この企業のどこに惹かれたかを1文で答える")).toBeVisible();
    await expect(page.getByText("企業固有の特徴に直接触れる候補")).toHaveCount(0);
    await expect(page.getByText("仮置き候補")).toHaveCount(0);
    await expect(page.getByRole("link", { name: /新卒採用ページ/ }).first()).toBeVisible();
  });

  test("mobile keeps the header CTA visible near the top", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/companies/${COMPANY_ID}/motivation`);

    await expect(page.getByRole("button", { name: "志望動機ESを作成" }).first()).toBeVisible();
    await expect(page.getByPlaceholder("回答を入力...")).toBeVisible();
    await expect(page.getByRole("button", { name: "会話をやり直す" }).first()).toBeVisible();
  });

  test("refetches conversation after stream failure instead of restoring stale chips", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 960 });

    let conversationVersion: "initial" | "updated" = "initial";

    await page.unroute(`**/api/motivation/${COMPANY_ID}/conversation`);
    await page.route(`**/api/motivation/${COMPANY_ID}/conversation`, async (route) => {
      if (route.request().method() !== "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ success: true, reset: true }),
        });
        return;
      }

      const body =
        conversationVersion === "initial"
          ? {
              messages: [
                {
                  id: "assistant-1",
                  role: "assistant",
                  content: "株式会社テストの業務改革に惹かれた理由を1つ教えてください。",
                },
              ],
              nextQuestion: "株式会社テストの業務改革に惹かれた理由を1つ教えてください。",
              questionCount: 1,
              isCompleted: false,
              scores: {
                company_understanding: 42,
                self_analysis: 36,
                career_vision: 28,
                differentiation: 33,
              },
              suggestionOptions: [
                {
                  id: "option-stale",
                  label: "業務改革を通じて顧客課題を解決できる点に惹かれたため",
                  sourceType: "company",
                  intent: "company_reason",
                  rationale: "企業固有の特徴に直接触れる候補",
                  isTentative: false,
                },
              ],
              evidenceSummary: "新卒採用ページ: 業務改革とDX支援を推進",
              evidenceCards: [],
              questionStage: "company_reason",
              stageStatus: {
                current: "company_reason",
                completed: [],
                pending: ["desired_work", "fit_connection", "differentiation", "closing"],
              },
              coachingFocus: "企業志望理由",
              conversationContext: {
                selectedIndustry: "IT・通信",
                selectedRole: "企画職",
                selectedRoleSource: "industry_default",
              },
              setup: {
                selectedIndustry: "IT・通信",
                selectedRole: "企画職",
                selectedRoleSource: "industry_default",
                requiresIndustrySelection: false,
                resolvedIndustry: "IT・通信",
                isComplete: true,
                requiresRestart: false,
                hasSavedConversation: true,
              },
            }
          : {
              messages: [
                {
                  id: "assistant-1",
                  role: "assistant",
                  content: "株式会社テストの業務改革に惹かれた理由を1つ教えてください。",
                },
                {
                  id: "user-1",
                  role: "user",
                  content: "顧客課題を解決できる点に惹かれます。",
                },
                {
                  id: "assistant-2",
                  role: "assistant",
                  content: "入社後にどんな仕事へ挑戦したいですか？",
                },
              ],
              nextQuestion: "入社後にどんな仕事へ挑戦したいですか？",
              questionCount: 2,
              isCompleted: false,
              scores: {
                company_understanding: 55,
                self_analysis: 44,
                career_vision: 34,
                differentiation: 41,
              },
              suggestionOptions: [
                {
                  id: "option-fresh",
                  label: "入社後は企画職として顧客の業務改善に挑戦したいです。",
                  sourceType: "application_job_type",
                  intent: "desired_work",
                  rationale: "応募職種から自然に導いた候補",
                  isTentative: true,
                },
              ],
              evidenceSummary: "新卒採用ページ: 業務改善の提案を担う",
              evidenceCards: [],
              questionStage: "desired_work",
              stageStatus: {
                current: "desired_work",
                completed: ["company_reason"],
                pending: ["origin_experience", "fit_connection", "differentiation", "closing"],
              },
              coachingFocus: "やりたい仕事",
              conversationContext: {
                selectedIndustry: "IT・通信",
                selectedRole: "企画職",
                selectedRoleSource: "industry_default",
                companyReason: "顧客課題を解決できる点に惹かれます。",
              },
              setup: {
                selectedIndustry: "IT・通信",
                selectedRole: "企画職",
                selectedRoleSource: "industry_default",
                requiresIndustrySelection: false,
                resolvedIndustry: "IT・通信",
                isComplete: true,
                requiresRestart: false,
                hasSavedConversation: true,
              },
            };

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(body),
      });
    });

    await page.route(`**/api/motivation/${COMPANY_ID}/conversation/stream`, async (route) => {
      conversationVersion = "updated";
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "stream failed after commit" }),
      });
    });

    await page.goto(`/companies/${COMPANY_ID}/motivation`);
    await expect(page.getByText("業務改革を通じて顧客課題を解決できる点に惹かれたため")).toBeVisible();

    await page.getByRole("button", { name: "業務改革を通じて顧客課題を解決できる点に惹かれたため" }).click();

    await expect(page.getByText("業務改革を通じて顧客課題を解決できる点に惹かれたため")).toHaveCount(0);
    await expect(page.getByText("入社後は企画職として顧客の業務改善に挑戦したいです。")).toBeVisible();
    await expect(page.getByText("入社後にどんな仕事へ挑戦したいですか？")).toBeVisible();
  });
});
