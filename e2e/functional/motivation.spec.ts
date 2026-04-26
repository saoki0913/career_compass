import { test, expect, type Page } from "@playwright/test";
import {
  loginAsGuest,
  ensureGuestSession,
  mockAuthenticatedUser,
  mockCredits,
} from "../fixtures/auth";

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
        conversationMode: "slot_fill",
        progress: {
          completed: 1,
          total: 6,
          current_slot: "company_reason",
          current_slot_label: "企業志望理由",
          current_intent: "initial_capture",
          next_advance_condition: "この企業を選ぶ理由が1つ言えればOK",
          mode: "slot_fill",
        },
        currentSlot: "company_reason",
        currentIntent: "initial_capture",
        nextAdvanceCondition: "この企業を選ぶ理由が1つ言えればOK",
        causalGaps: [],
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
          pending: ["self_connection", "desired_work", "value_contribution", "differentiation"],
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
    await mockMotivationPage(page);
    await mockMotivationShellApis(page);
  });

  test("shows login required for AI features", async ({ page }) => {
    await page.goto(`/companies/${COMPANY_ID}/motivation`);
    await expect(
      page.getByText("志望動機のAI支援はログイン後にご利用いただけます")
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "ログイン / 新規登録" })).toBeVisible();
  });
});

async function mockDraftReadyConversation(page: Page) {
  await page.unroute(`**/api/motivation/${COMPANY_ID}/conversation`);
  await page.route(`**/api/motivation/${COMPANY_ID}/conversation`, async (route) => {
    if (route.request().method() !== "GET") {
      return route.continue();
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        messages: [
          { id: "a-1", role: "assistant", content: "株式会社テストを志望する理由を教えてください。" },
          { id: "u-1", role: "user", content: "DX推進に共感しました。" },
          { id: "a-2", role: "assistant", content: "入社後にどんな仕事へ挑戦したいですか？" },
          { id: "u-2", role: "user", content: "プロダクト改善を担いたいです。" },
          { id: "a-3", role: "assistant", content: "自分の強みをどう活かしますか？" },
          { id: "u-3", role: "user", content: "課題発見力が強みです。" },
          { id: "a-4", role: "assistant", content: "業界を選んだ理由は何ですか？" },
          { id: "u-4", role: "user", content: "IT業界の成長性に惹かれています。" },
          { id: "a-5", role: "assistant", content: "チームで成果を出した経験を教えてください。" },
          { id: "u-5", role: "user", content: "学園祭の実行委員として300人を動かしました。" },
          { id: "a-6", role: "assistant", content: "他社と比べてこの会社を選ぶ決め手は何ですか？" },
          { id: "u-6", role: "user", content: "技術力と社風の両立が決め手です。" },
        ],
        nextQuestion: null,
        questionCount: 6,
        isCompleted: false,
        isDraftReady: true,
        scores: {
          company_understanding: 75,
          self_analysis: 70,
          career_vision: 68,
          differentiation: 72,
        },
        conversationMode: "slot_fill",
        progress: { completed: 6, total: 6 },
        currentSlot: "differentiation",
        currentIntent: null,
        nextAdvanceCondition: null,
        causalGaps: [],
        evidenceSummary: null,
        evidenceCards: [],
        questionStage: "differentiation",
        stageStatus: {
          current: "differentiation",
          completed: [
            "industry_reason",
            "company_reason",
            "self_connection",
            "desired_work",
            "value_contribution",
            "differentiation",
          ],
          pending: [],
        },
        coachingFocus: null,
        generatedDraft: null,
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

  test("desktop shows a single header CTA, visible restart button, and progress state", async ({
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
    await expect(page.getByText("進捗", { exact: true }).first()).toBeVisible();
    await expect(page.getByLabel("企業理由: 進行中")).toBeVisible();
    await expect(page.getByText("今確認していること")).toBeVisible();
    await expect(page.getByText("ES作成可").first()).toBeVisible();
    await expect(page.getByRole("link", { name: /新卒採用ページ/ }).first()).toBeVisible();
  });

  test("mobile keeps the header CTA visible near the top", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/companies/${COMPANY_ID}/motivation`);

    await expect(page.getByRole("button", { name: "志望動機ESを作成" }).first()).toBeVisible();
    await expect(page.getByRole("textbox")).toBeVisible();
    await expect(page.getByRole("button", { name: "会話をやり直す" }).first()).toBeVisible();
    await expect(page.getByText("企業志望理由を整理中").first()).toBeVisible();
  });

  test("refetches conversation after stream failure instead of restoring stale state", async ({
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
              conversationMode: "slot_fill",
              progress: {
                completed: 1,
                total: 6,
                current_slot: "company_reason",
                current_slot_label: "企業志望理由",
                current_intent: "initial_capture",
                next_advance_condition: "この企業を選ぶ理由が1つ言えればOK",
                mode: "slot_fill",
              },
              currentSlot: "company_reason",
              currentIntent: "initial_capture",
              nextAdvanceCondition: "この企業を選ぶ理由が1つ言えればOK",
              causalGaps: [],
              evidenceSummary: "新卒採用ページ: 業務改革とDX支援を推進",
              evidenceCards: [],
              questionStage: "company_reason",
              stageStatus: {
                current: "company_reason",
                completed: [],
                pending: ["self_connection", "desired_work", "value_contribution", "differentiation"],
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
              conversationMode: "slot_fill",
              progress: {
                completed: 2,
                total: 6,
                current_slot: "desired_work",
                current_slot_label: "やりたい仕事",
                current_intent: "initial_capture",
                next_advance_condition: "入社後にやりたい仕事が1つ言えればOK",
                mode: "slot_fill",
              },
              currentSlot: "desired_work",
              currentIntent: "initial_capture",
              nextAdvanceCondition: "入社後にやりたい仕事が1つ言えればOK",
              causalGaps: [],
              evidenceSummary: "新卒採用ページ: 業務改善の提案を担う",
              evidenceCards: [],
              questionStage: "desired_work",
              stageStatus: {
                current: "desired_work",
                completed: ["company_reason"],
                pending: ["industry_reason", "self_connection", "value_contribution", "differentiation"],
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
    await expect(page.getByLabel("企業理由: 進行中")).toBeVisible();
    await expect(page.getByText("今確認していること")).toBeVisible();

    await page.getByRole("textbox").fill("顧客課題を解決できる点に惹かれます。");
    await page.getByRole("textbox").press("Enter");

    await expect(page.getByLabel("希望業務: 進行中")).toBeVisible();
    await expect(page.getByText("入社後にどんな仕事へ挑戦したいですか？")).toBeVisible();
  });
});

test.describe("Motivation page (draft-ready flows)", () => {
  test.beforeEach(async ({ page }) => {
    await mockMotivationPage(page);
    await mockAuthenticatedUser(page, {
      id: "motivation-e2e-draft-user",
      name: "Draft E2E User",
      email: "e2e-motivation-draft@example.com",
      plan: "free",
    });
    await mockCredits(page, { type: "user", plan: "free", balance: 100 });
    await mockMotivationShellApis(page);
  });

  test("shows draft_ready transitional message when all slots are filled", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 960 });
    await mockDraftReadyConversation(page);
    await page.goto(`/companies/${COMPANY_ID}/motivation`);

    await expect(
      page.getByText("志望動機の材料が揃いました", { exact: false })
    ).toBeVisible();
    await expect(page.getByRole("textbox")).toHaveAttribute(
      "placeholder",
      "ESを生成すると、補強の質問が始まります"
    );
  });

  test("generates draft, shows snackbar and modal", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 960 });
    await mockDraftReadyConversation(page);

    await page.route(`**/api/motivation/${COMPANY_ID}/generate-draft`, async (route) => {
      if (route.request().method() !== "POST") {
        return route.continue();
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          draft: "テスト志望動機です。企業のDX推進に共感し…",
          charCount: 200,
          keyPoints: ["企業理解"],
          companyKeywords: ["DX"],
          documentId: null,
          nextQuestion: "さらに補強したい点はどこですか？",
          conversationMode: "deepdive",
          causalGaps: [
            {
              id: "g1",
              slot: "self_connection",
              reason: "経験との接続が弱い",
              promptHint: "",
            },
          ],
          stageStatus: {
            current: "self_connection",
            completed: [
              "industry_reason",
              "company_reason",
              "self_connection",
              "desired_work",
              "value_contribution",
              "differentiation",
            ],
            pending: [],
          },
          messages: [
            { role: "user", content: "a" },
            { role: "assistant", content: "b" },
            { role: "assistant", content: "さらに補強したい点はどこですか？" },
          ],
          evidenceSummary: null,
          evidenceCards: [],
          questionStage: "self_connection",
          coachingFocus: null,
          currentSlot: "self_connection",
          currentIntent: null,
          nextAdvanceCondition: null,
          progress: null,
        }),
      });
    });

    await page.goto(`/companies/${COMPANY_ID}/motivation`);
    await page.getByRole("button", { name: "志望動機ESを作成" }).click();

    await expect(page.getByText("ESを生成しました")).toBeVisible();
    await expect(
      page.getByRole("dialog").filter({ hasText: "生成した志望動機ES" })
    ).toBeVisible();
    await expect(page.getByText("テスト志望動機です")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "ESとして保存する" })
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "もっと深堀りして再生成する" })
    ).toBeVisible();
  });

  test("closing modal resumes deepdive conversation", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 960 });
    await mockDraftReadyConversation(page);

    await page.route(`**/api/motivation/${COMPANY_ID}/generate-draft`, async (route) => {
      if (route.request().method() !== "POST") {
        return route.continue();
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          draft: "テスト志望動機です。企業のDX推進に共感し…",
          charCount: 200,
          keyPoints: ["企業理解"],
          companyKeywords: ["DX"],
          documentId: null,
          nextQuestion: "さらに補強したい点はどこですか？",
          conversationMode: "deepdive",
          causalGaps: [],
          stageStatus: {
            current: "self_connection",
            completed: [
              "industry_reason",
              "company_reason",
              "self_connection",
              "desired_work",
              "value_contribution",
              "differentiation",
            ],
            pending: [],
          },
          messages: [
            { role: "user", content: "a" },
            { role: "assistant", content: "b" },
            { role: "assistant", content: "さらに補強したい点はどこですか？" },
          ],
          evidenceSummary: null,
          evidenceCards: [],
          questionStage: "self_connection",
          coachingFocus: null,
          currentSlot: "self_connection",
          currentIntent: null,
          nextAdvanceCondition: null,
          progress: null,
        }),
      });
    });

    await page.goto(`/companies/${COMPANY_ID}/motivation`);
    await page.getByRole("button", { name: "志望動機ESを作成" }).click();

    await expect(
      page.getByRole("dialog").filter({ hasText: "生成した志望動機ES" })
    ).toBeVisible();

    await page.getByRole("button", { name: "もっと深堀りして再生成する" }).click();

    await expect(
      page.getByRole("dialog").filter({ hasText: "生成した志望動機ES" })
    ).not.toBeVisible();
    await expect(page.getByText("さらに補強したい点はどこですか？")).toBeVisible();
    await expect(page.getByRole("textbox")).not.toBeDisabled();
  });

  test("saving draft navigates to ES edit page", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 960 });
    await mockDraftReadyConversation(page);

    await page.route(`**/api/motivation/${COMPANY_ID}/generate-draft`, async (route) => {
      if (route.request().method() !== "POST") {
        return route.continue();
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          draft: "テスト志望動機です。企業のDX推進に共感し…",
          charCount: 200,
          keyPoints: ["企業理解"],
          companyKeywords: ["DX"],
          documentId: null,
          nextQuestion: "さらに補強したい点はどこですか？",
          conversationMode: "deepdive",
          causalGaps: [],
          stageStatus: {
            current: "self_connection",
            completed: [
              "industry_reason",
              "company_reason",
              "self_connection",
              "desired_work",
              "value_contribution",
              "differentiation",
            ],
            pending: [],
          },
          messages: [
            { role: "user", content: "a" },
            { role: "assistant", content: "b" },
            { role: "assistant", content: "さらに補強したい点はどこですか？" },
          ],
          evidenceSummary: null,
          evidenceCards: [],
          questionStage: "self_connection",
          coachingFocus: null,
          currentSlot: "self_connection",
          currentIntent: null,
          nextAdvanceCondition: null,
          progress: null,
        }),
      });
    });

    await page.route(`**/api/motivation/${COMPANY_ID}/save-draft`, async (route) => {
      if (route.request().method() !== "POST") {
        return route.continue();
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ documentId: "doc-123" }),
      });
    });

    await page.goto(`/companies/${COMPANY_ID}/motivation`);
    await page.getByRole("button", { name: "志望動機ESを作成" }).click();

    await expect(
      page.getByRole("dialog").filter({ hasText: "生成した志望動機ES" })
    ).toBeVisible();

    await page.getByRole("button", { name: "ESとして保存する" }).click();

    await expect(page).toHaveURL(/\/es\/doc-123/);
  });

  test("shows deepdive completion message when no follow-up question", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 960 });

    await page.unroute(`**/api/motivation/${COMPANY_ID}/conversation`);
    await page.route(`**/api/motivation/${COMPANY_ID}/conversation`, async (route) => {
      if (route.request().method() !== "GET") {
        return route.continue();
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          messages: [
            { id: "a-1", role: "assistant", content: "補強について教えてください。" },
            { id: "u-1", role: "user", content: "はい、補強しました。" },
          ],
          nextQuestion: null,
          questionCount: 6,
          isCompleted: false,
          isDraftReady: true,
          generatedDraft: "既存の下書きです。",
          conversationMode: "deepdive",
          progress: null,
          currentSlot: null,
          currentIntent: null,
          nextAdvanceCondition: null,
          causalGaps: [],
          evidenceSummary: null,
          evidenceCards: [],
          questionStage: "differentiation",
          stageStatus: {
            current: "differentiation",
            completed: [
              "industry_reason",
              "company_reason",
              "self_connection",
              "desired_work",
              "value_contribution",
              "differentiation",
            ],
            pending: [],
          },
          coachingFocus: null,
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

    await page.goto(`/companies/${COMPANY_ID}/motivation`);

    await expect(
      page.getByText("補強が完了しました", { exact: false })
    ).toBeVisible();
  });

  test("progress pills reflect slot_fill stage status", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 960 });
    await page.goto(`/companies/${COMPANY_ID}/motivation`);

    await expect(page.getByLabel("企業理由: 進行中")).toBeVisible();
    await expect(page.getByLabel("業界理由: 未着手")).toBeVisible();
    await expect(page.getByLabel("自己接続: 未着手")).toBeVisible();
    await expect(page.getByLabel("希望業務: 未着手")).toBeVisible();
    await expect(page.getByLabel("価値貢献: 未着手")).toBeVisible();
    await expect(page.getByLabel("差別化: 未着手")).toBeVisible();
    await expect(page.getByText("1問目 / 約6問")).toBeVisible();
  });

  test("phase tracker shows ES作成可 as current during slot_fill", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 960 });
    await page.goto(`/companies/${COMPANY_ID}/motivation`);

    const phaseBar = page.locator("div, section, aside, nav").filter({ hasText: "ES作成可" }).filter({ hasText: "深堀り中" }).first();
    await expect(phaseBar.getByText("ES作成可")).toBeVisible();
    await expect(phaseBar.getByText("進行中")).toBeVisible();
    await expect(phaseBar.getByText("深堀り中")).toBeVisible();
    await expect(phaseBar.getByText("未着手").first()).toBeVisible();
  });

  test("phase tracker shows draft_ready done and deepdive current after generate-draft", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 960 });
    await mockDraftReadyConversation(page);

    await page.route(`**/api/motivation/${COMPANY_ID}/generate-draft`, async (route) => {
      if (route.request().method() !== "POST") {
        return route.continue();
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          draft: "テスト志望動機です。",
          charCount: 100,
          keyPoints: [],
          companyKeywords: [],
          documentId: null,
          nextQuestion: "補強します。",
          conversationMode: "deepdive",
          causalGaps: [{ id: "g1", slot: "self_connection", reason: "弱い", promptHint: "" }],
          stageStatus: {
            current: "self_connection",
            completed: ["industry_reason", "company_reason", "self_connection", "desired_work", "value_contribution", "differentiation"],
            pending: [],
          },
          messages: [
            { role: "user", content: "a" },
            { role: "assistant", content: "b" },
            { role: "assistant", content: "補強します。" },
          ],
          evidenceSummary: null,
          evidenceCards: [],
          questionStage: "self_connection",
          coachingFocus: null,
          currentSlot: "self_connection",
          currentIntent: null,
          nextAdvanceCondition: null,
          progress: null,
        }),
      });
    });

    await page.goto(`/companies/${COMPANY_ID}/motivation`);
    await page.getByRole("button", { name: "志望動機ESを作成" }).click();

    await expect(page.getByRole("dialog").filter({ hasText: "生成した志望動機ES" })).toBeVisible();
    await page.getByRole("button", { name: "もっと深堀りして再生成する" }).click();

    const phaseBar = page.locator("div, section, aside, nav").filter({ hasText: "ES作成可" }).filter({ hasText: "深堀り中" }).first();
    await expect(phaseBar.getByText("完了").first()).toBeVisible();
    await expect(phaseBar.getByText("深堀り中")).toBeVisible();
  });

  test("question counter switches to deepdive format", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 960 });

    await page.unroute(`**/api/motivation/${COMPANY_ID}/conversation`);
    await page.route(`**/api/motivation/${COMPANY_ID}/conversation`, async (route) => {
      if (route.request().method() !== "GET") {
        return route.continue();
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          messages: [
            { id: "a-1", role: "assistant", content: "補強質問です。" },
          ],
          nextQuestion: "補強質問です。",
          questionCount: 8,
          isCompleted: false,
          isDraftReady: true,
          generatedDraft: "既存ES。",
          conversationMode: "deepdive",
          progress: null,
          currentSlot: null,
          currentIntent: null,
          nextAdvanceCondition: null,
          causalGaps: [{ id: "g1", slot: "self_connection", reason: "弱い", promptHint: "" }],
          evidenceSummary: null,
          evidenceCards: [],
          questionStage: "self_connection",
          stageStatus: {
            current: "self_connection",
            completed: ["industry_reason", "company_reason", "self_connection", "desired_work", "value_contribution", "differentiation"],
            pending: [],
          },
          coachingFocus: null,
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

    await page.goto(`/companies/${COMPANY_ID}/motivation`);
    await expect(page.getByText("8問目 / 補強中")).toBeVisible();
  });
});
