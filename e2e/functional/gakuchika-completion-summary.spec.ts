import { expect, test, type Page } from "@playwright/test";
import { mockAuthenticatedUser, mockCredits } from "../fixtures/auth";

const GAKUCHIKA_ID = "gk-1";

const STRUCTURED_SUMMARY = {
  situation_text:
    "大学3年の学園祭で、実行委員として模擬店エリアの運営を担当。来場者数は前年の1.5倍に増加していた。",
  task_text:
    "昼のピーク時に待機列が交差して回遊しにくく、参加団体から苦情が出ていた。",
  action_text:
    "会場図を俯瞰で見直し、待機列の分離と案内役の再配置を提案。当日は配置変更を指揮した。",
  result_text:
    "ピーク時の交差が解消され、参加団体アンケートで満足度が4.2→4.7に向上した。",
  strengths: [
    {
      title: "俯瞰して構造を見直す力",
      description: "個別対応ではなく導線全体を設計し直した",
    },
    {
      title: "当日の実行力",
      description: "計画を立てるだけでなく現場で指揮を執った",
    },
  ],
  learnings: [
    {
      title: "全体最適の重要性",
      description: "部分的な改善では根本解決しないことを学んだ",
    },
  ],
  numbers: ["満足度4.2→4.7", "来場者1.5倍"],
  one_line_core_answer:
    "導線設計を俯瞰で見直し、来場者と出店者双方の満足度を上げた経験",
  two_minute_version_outline: [
    "学園祭実行委員として模擬店エリアを担当",
    "ピーク時の導線交差が課題だった",
    "会場図を俯瞰で分析し、列の分離と案内の再配置を提案",
    "当日は自ら指揮を執り、満足度4.7を達成",
  ],
  likely_followup_questions: [
    "他のメンバーはどう巻き込みましたか？",
    "反対意見はありましたか？",
  ],
  weak_points_to_prepare: ["数値の根拠（アンケート回収率など）"],
  interviewer_hooks: ["全体最適の視点", "現場指揮の実行力"],
  reusable_principles: ["俯瞰→構造把握→提案→実行の順で動く"],
  interview_supporting_details: ["アンケートは参加40団体中35団体が回答"],
  future_outlook_notes: ["社会人でもプロジェクト全体を見渡す役割を担いたい"],
  backstory_notes: ["高校の文化祭で混雑を経験したことが原体験"],
};

const LEGACY_SUMMARY = {
  summary: "学園祭実行委員として運営改善に取り組み...",
  key_points: [],
  numbers: [],
  strengths: [{ title: "リーダーシップ" }],
};

const CONVERSATION_RESPONSE_INTERVIEW_READY = {
  conversation: { id: "conv-1", questionCount: 8, status: "completed" },
  messages: [
    {
      id: "m-1",
      role: "assistant",
      content: "学園祭でどのような課題がありましたか？",
    },
    {
      id: "m-2",
      role: "user",
      content: "来場者の導線が混雑して...",
    },
  ],
  nextQuestion: null,
  questionCount: 8,
  isCompleted: true,
  conversationState: {
    stage: "interview_ready",
    focusKey: "result",
    progressLabel: "面接準備完了",
    readyForDraft: true,
    draftText: "私は大学3年の学園祭実行委員として...",
    deepdiveComplete: true,
    extendedDeepDiveRound: 0,
    missingElements: [],
    completionReasons: ["all_elements_covered"],
    inputRichnessMode: "rough_episode",
    strengthTags: ["ownership_visible"],
    issueTags: [],
    deepdiveRecommendationTags: [],
    credibilityRiskTags: [],
    askedFocuses: ["context", "task", "action", "result", "learning"],
    resolvedFocuses: ["context", "task", "action", "result", "learning"],
    deferredFocuses: [],
    blockedFocuses: [],
    focusAttemptCounts: {},
    draftQualityChecks: {},
    causalGaps: [],
    completionChecks: {},
  },
  nextAction: "show_interview_ready",
  isInterviewReady: true,
  isAIPowered: true,
  gakuchikaContent: "学園祭実行委員として模擬店エリアの導線改善",
  charLimitType: "400",
  sessions: [
    {
      id: "conv-1",
      status: "completed",
      conversationState: null,
      questionCount: 8,
      createdAt: "2026-04-01T00:00:00Z",
    },
  ],
};

async function mockShellApis(page: Page) {
  await page.route("**/api/notifications**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ notifications: [], unreadCount: 0 }),
    });
  });
}

async function setupAuthenticatedUser(page: Page) {
  await mockAuthenticatedUser(page, {
    id: "user-e2e",
    name: "E2E User",
    email: "e2e@example.com",
    plan: "standard",
  });
  await mockCredits(page, { balance: 100, plan: "standard" });
  await mockShellApis(page);
}

async function mockConversationApi(page: Page, isInterviewReady: boolean) {
  await page.route(
    `**/api/gakuchika/${GAKUCHIKA_ID}/conversation**`,
    async (route) => {
      if (route.request().method() !== "GET") {
        return route.continue();
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ...CONVERSATION_RESPONSE_INTERVIEW_READY,
          isInterviewReady,
          conversationState: isInterviewReady
            ? CONVERSATION_RESPONSE_INTERVIEW_READY.conversationState
            : {
                ...CONVERSATION_RESPONSE_INTERVIEW_READY.conversationState,
                stage: "deepdive",
              },
        }),
      });
    },
  );
}

async function mockGakuchikaDetailApi(
  page: Page,
  summaryValue: unknown,
) {
  await page.route(
    `**/api/gakuchika/${GAKUCHIKA_ID}`,
    async (route) => {
      if (route.request().method() !== "GET") {
        return route.continue();
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          gakuchika: {
            id: GAKUCHIKA_ID,
            title: "学園祭実行委員",
            content: "模擬店エリアの導線改善",
            userId: "user-e2e",
            guestId: null,
            charLimitType: "400",
            summary:
              summaryValue !== null
                ? JSON.stringify(summaryValue)
                : null,
            createdAt: "2026-04-01T00:00:00Z",
            updatedAt: "2026-04-01T00:00:00Z",
          },
        }),
      });
    },
  );
}

test.describe("Gakuchika CompletionSummary (interview_ready state)", () => {
  test("displays structured summary when interview_ready", async ({ page }) => {
    await setupAuthenticatedUser(page);
    await mockConversationApi(page, true);
    await mockGakuchikaDetailApi(page, STRUCTURED_SUMMARY);

    await page.goto(`/gakuchika/${GAKUCHIKA_ID}`);

    // The heading only appears when hasVisibleBody is true (structured summary loaded)
    await expect(
      page.getByRole("heading", {
        name: "面接用の補足まで整理できました",
        level: 2,
      }),
    ).toBeVisible({ timeout: 10000 });

    // "まず話す核" section title is visible
    await expect(page.getByText("まず話す核")).toBeVisible();

    // The one_line_core_answer text is rendered inside a <p>
    await expect(
      page.getByText(
        "導線設計を俯瞰で見直し、来場者と出店者双方の満足度を上げた経験",
      ),
    ).toBeVisible();

    // Verify STAR content is rendered (using unique text from each section)
    await expect(
      page.getByText("来場者数は前年の1.5倍に増加していた"),
    ).toBeVisible();
    await expect(
      page.getByText("参加団体から苦情が出ていた"),
    ).toBeVisible();
    await expect(
      page.getByText("当日は配置変更を指揮した"),
    ).toBeVisible();
    await expect(
      page.getByText("満足度が4.2→4.7に向上した"),
    ).toBeVisible();

    // "強み" section is visible
    await expect(page.getByText("強み")).toBeVisible();

    // Error fallback must NOT be visible
    await expect(
      page.getByText("要点の本文を表示できませんでした"),
    ).not.toBeVisible();

    // "もっと深掘る" button is visible (onResumeSession is wired up in the page)
    await expect(
      page.getByRole("button", { name: "もっと深掘る" }),
    ).toBeVisible();

    // "一覧に戻る" button/link is visible
    await expect(
      page.getByRole("button", { name: "一覧に戻る" }),
    ).toBeVisible();
  });

  test("shows error fallback when summary is null and retry recovers", async ({
    page,
  }, testInfo) => {
    testInfo.setTimeout(90000);
    await setupAuthenticatedUser(page);
    await mockConversationApi(page, true);

    // Initial state: no summary — polling will start and exhaust
    let summaryToReturn: unknown = null;

    await page.route(
      `**/api/gakuchika/${GAKUCHIKA_ID}`,
      async (route) => {
        if (route.request().method() !== "GET") {
          return route.continue();
        }
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            gakuchika: {
              id: GAKUCHIKA_ID,
              title: "学園祭実行委員",
              content: "模擬店エリアの導線改善",
              userId: "user-e2e",
              guestId: null,
              charLimitType: "400",
              summary:
                summaryToReturn !== null
                  ? JSON.stringify(summaryToReturn)
                  : null,
              createdAt: "2026-04-01T00:00:00Z",
              updatedAt: "2026-04-01T00:00:00Z",
            },
          }),
        });
      },
    );

    await page.goto(`/gakuchika/${GAKUCHIKA_ID}`);

    // After polling exhausts (12 attempts × ~1500ms + 7 attempts × ~3000ms ≈ 39s max),
    // the error fallback becomes visible. Use a generous timeout.
    await expect(
      page.getByText("要点の本文を表示できませんでした"),
    ).toBeVisible({ timeout: 50000 });

    // The retry button must be present
    await expect(
      page.getByRole("button", { name: "要約を再取得" }),
    ).toBeVisible();

    // Before clicking retry, update the mock to return a valid summary so the
    // next polling cycle finds it immediately
    summaryToReturn = STRUCTURED_SUMMARY;

    await page.getByRole("button", { name: "要約を再取得" }).click();

    // After retry triggers a new poll cycle, the heading appears
    await expect(
      page.getByRole("heading", {
        name: "面接用の補足まで整理できました",
        level: 2,
      }),
    ).toBeVisible({ timeout: 15000 });

    // Error text must disappear
    await expect(
      page.getByText("要点の本文を表示できませんでした"),
    ).not.toBeVisible();
  });

  test("renders legacy summary format", async ({ page }) => {
    await setupAuthenticatedUser(page);
    await mockConversationApi(page, true);
    await mockGakuchikaDetailApi(page, LEGACY_SUMMARY);

    await page.goto(`/gakuchika/${GAKUCHIKA_ID}`);

    // The legacy branch shows a "要約" section heading
    await expect(page.getByText("要約")).toBeVisible({ timeout: 10000 });

    // The legacy summary text is rendered
    await expect(
      page.getByText("学園祭実行委員として運営改善に取り組み..."),
    ).toBeVisible();

    // The "リーダーシップ" strength badge is visible
    await expect(page.getByText("リーダーシップ")).toBeVisible();

    // Same heading appears for legacy because hasVisibleBody is true (legacyVisible=true)
    await expect(
      page.getByRole("heading", {
        name: "面接用の補足まで整理できました",
        level: 2,
      }),
    ).toBeVisible();
  });
});
