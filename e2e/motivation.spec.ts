import { test, expect, type Page } from "@playwright/test";
import { loginAsGuest } from "./fixtures/auth";

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

test.describe("Motivation Page", () => {
  test.beforeEach(async ({ page }) => {
    await mockMotivationPage(page);
    await loginAsGuest(page);
  });

  test("desktop shows top CTA, visible restart button, and direct-answer options", async ({ page }) => {
    await page.goto(`/companies/${COMPANY_ID}/motivation`);

    await expect(page.getByRole("heading", { name: "志望動機を作成" })).toBeVisible();
    await expect(page.getByRole("button", { name: "志望動機ESを作成" }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "会話をやり直す" }).first()).toBeVisible();
    await expect(page.getByText("この企業のどこに惹かれたかを1文で答える")).toBeVisible();
    await expect(page.getByText("企業固有の特徴に直接触れる候補")).toHaveCount(0);
    await expect(page.getByText("仮置き候補")).toHaveCount(0);
    await expect(page.getByRole("link", { name: /新卒採用ページ/ }).first()).toBeVisible();
  });

  test("mobile keeps ES CTA visible above the input area", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/companies/${COMPANY_ID}/motivation`);

    await expect(page.getByRole("button", { name: "志望動機ESを作成" }).first()).toBeVisible();
    await expect(page.getByPlaceholder("回答を入力...")).toBeVisible();
    await expect(page.getByText("質問に使った企業情報の要点が、ここに簡潔に表示されます。")).toHaveCount(0);
  });
});
