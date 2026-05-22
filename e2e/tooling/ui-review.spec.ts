import fs from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import {
  ensureGuestSession,
  loginAsGuest,
  mockAuthenticatedUser,
  mockCredits,
} from "../fixtures/auth";
import { parseUiReviewPaths, slugifyUiReviewPath } from "../../src/lib/ui-review-cli.mjs";

const authMode = process.env.PLAYWRIGHT_UI_AUTH_MODE?.trim() || "none";
const reviewPaths = parseUiReviewPaths(process.env.PLAYWRIGHT_UI_PATHS);
const screenshotDir = path.join(process.cwd(), "test-results", "ui-review");

const viewports = [
  { height: 740, name: "mobile-narrow", width: 320 },
  { height: 844, name: "mobile", width: 390 },
  { height: 1024, name: "tablet", width: 768 },
  { height: 1180, name: "tablet-820", width: 820 },
  { height: 900, name: "laptop", width: 1024 },
  { height: 900, name: "desktop-1100", width: 1100 },
  { height: 900, name: "desktop-1152", width: 1152 },
  { height: 900, name: "desktop-1200", width: 1200 },
  { height: 900, name: "desktop", width: 1440 },
] as const;

const MOTIVATION_COMPANY_ID = "ui-review-company";
const UI_REVIEW_COMPANY = {
  id: "ui-review-company",
  name: "UI Review株式会社",
  industry: "IT・通信",
  status: "in_progress",
  isPinned: true,
  createdAt: "2026-03-01T09:00:00.000Z",
  updatedAt: "2026-03-12T09:00:00.000Z",
  nearestDeadline: null,
  applicationCount: 2,
  activeApplicationCount: 1,
  documentCount: 3,
  esDocumentCount: 1,
  userId: "ui-review-user",
  guestId: null,
  recruitmentUrl: null,
  corporateUrl: null,
  mypageUrl: null,
  hasCredentials: false,
  notes: null,
  sortOrder: 0,
  infoFetchedAt: null,
} as const;

const UI_REVIEW_COMPANY_DETAIL = {
  id: MOTIVATION_COMPANY_ID,
  name: "三菱商事",
  industry: "商社",
  status: "inbox",
  recruitmentUrl: "https://www.mitsubishicorp.com/jp/ja/recruit/",
  corporateUrl: "https://www.mitsubishicorp.com/jp/ja/",
  mypageUrl: "https://mypage.example.com/mitsubishi",
  hasCredentials: true,
  notes: null,
  createdAt: "2026-03-01T09:00:00.000Z",
  updatedAt: "2026-05-13T09:00:00.000Z",
} as const;

const UI_REVIEW_ES_DOCUMENT = {
  id: "ui-review-es-1",
  title: "三菱商事 志望動機",
  type: "es",
  status: "draft",
  updatedAt: "2026-05-13T09:00:00.000Z",
} as const;

const UI_REVIEW_CORPORATE_INFO_STATUS = {
  companyId: MOTIVATION_COMPANY_ID,
  corporateInfoFetchedAt: "2026-05-13T09:00:00.000Z",
  corporateInfoUrls: [
    {
      url: "https://www.mitsubishicorp.com/jp/ja/recruit/newgraduate/",
      contentType: "new_grad_recruitment",
      fetchedAt: "2026-05-13T09:00:00.000Z",
      status: "completed",
      sourceType: "official",
      trustedForEsReview: true,
    },
    {
      url: "https://www.mitsubishicorp.com/jp/ja/recruit/career/",
      contentType: "midcareer_recruitment",
      fetchedAt: "2026-05-13T09:00:00.000Z",
      status: "completed",
      sourceType: "official",
      trustedForEsReview: true,
    },
    {
      url: "https://www.mitsubishicorp.com/jp/ja/about/",
      contentType: "corporate_site",
      fetchedAt: "2026-05-13T09:00:00.000Z",
      status: "completed",
      sourceType: "official",
      trustedForEsReview: true,
    },
    {
      url: "https://www.mitsubishicorp.com/jp/ja/ir/",
      contentType: "ir_materials",
      fetchedAt: "2026-05-13T09:00:00.000Z",
      status: "completed",
      sourceType: "official",
      trustedForEsReview: true,
    },
    {
      url: "https://www.mitsubishicorp.com/jp/ja/news/",
      contentType: "press_release",
      fetchedAt: "2026-05-13T09:00:00.000Z",
      status: "completed",
      sourceType: "official",
      trustedForEsReview: true,
    },
  ],
  ragStatus: {
    hasRag: true,
    totalChunks: 0,
    newGradRecruitmentChunks: 0,
    midcareerRecruitmentChunks: 0,
    corporateSiteChunks: 0,
    irMaterialsChunks: 0,
    ceoMessageChunks: 0,
    employeeInterviewsChunks: 0,
    pressReleaseChunks: 0,
    csrSustainabilityChunks: 0,
    midtermPlanChunks: 0,
    lastUpdated: "2026-05-13T09:00:00.000Z",
  },
  ragStatusUnavailable: true,
  statusReason: "企業情報の連携状況を確認できませんでした。時間を置いて再読み込みしてください。",
  pageLimit: 500,
} as const;

async function mockCompaniesRoute(
  page: Page,
  routePath: string,
) {
  if (!routePath.startsWith("/companies") && routePath !== "/dashboard") {
    return;
  }

  await page.route("**/api/companies", async (route) => {
    if (route.request().method() !== "GET") {
      return route.continue();
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        companies: [UI_REVIEW_COMPANY],
        count: 1,
        limit: null,
        canAddMore: true,
      }),
    });
  });
}

async function mockCompanyDetailRoute(
  page: Page,
  routePath: string,
) {
  if (routePath !== `/companies/${MOTIVATION_COMPANY_ID}`) {
    return;
  }

  await page.route(`**/api/companies/${MOTIVATION_COMPANY_ID}`, async (route) => {
    if (route.request().method() !== "GET") {
      return route.continue();
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ company: UI_REVIEW_COMPANY_DETAIL }),
    });
  });

  await page.route(`**/api/companies/${MOTIVATION_COMPANY_ID}/deadlines`, async (route) => {
    if (route.request().method() !== "GET") {
      return route.continue();
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ deadlines: [] }),
    });
  });

  await page.route(`**/api/companies/${MOTIVATION_COMPANY_ID}/applications`, async (route) => {
    if (route.request().method() !== "GET") {
      return route.continue();
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ applications: [] }),
    });
  });

  await page.route("**/api/documents?**", async (route) => {
    const url = new URL(route.request().url());
    if (
      route.request().method() !== "GET" ||
      url.searchParams.get("companyId") !== MOTIVATION_COMPANY_ID
    ) {
      return route.continue();
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ documents: [UI_REVIEW_ES_DOCUMENT] }),
    });
  });

  await page.route(`**/api/companies/${MOTIVATION_COMPANY_ID}/fetch-corporate`, async (route) => {
    if (route.request().method() !== "GET") {
      return route.continue();
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(UI_REVIEW_CORPORATE_INFO_STATUS),
    });
  });

  await page.route(`**/api/companies/${MOTIVATION_COMPANY_ID}/credentials`, async (route) => {
    if (route.request().method() !== "GET") {
      return route.continue();
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ mypagePassword: "ui-review-password" }),
    });
  });
}

async function mockCalendarRoute(
  page: Page,
  routePath: string,
) {
  if (routePath !== "/calendar" && routePath !== "/dashboard") {
    return;
  }

  await page.route("**/api/calendar/events**", async (route) => {
    if (route.request().method() !== "GET") {
      return route.continue();
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        events: [
          {
            id: "event-1",
            userId: "ui-review-user",
            deadlineId: null,
            googleCalendarId: null,
            googleEventId: null,
            googleSyncStatus: "idle",
            googleSyncError: null,
            googleSyncedAt: null,
            type: "work_block",
            title: "ESブラッシュアップ",
            startAt: "2026-05-03T10:00:00.000Z",
            endAt: "2026-05-03T11:30:00.000Z",
            createdAt: "2026-05-01T09:00:00.000Z",
            updatedAt: "2026-05-01T09:00:00.000Z",
          },
        ],
        deadlines: [
          {
            id: "deadline-1",
            title: "ES提出",
            type: "entry_sheet",
            dueDate: "2026-05-03T14:00:00.000Z",
            companyId: UI_REVIEW_COMPANY.id,
            companyName: UI_REVIEW_COMPANY.name,
            isConfirmed: true,
            completedAt: null,
            googleSyncStatus: "idle",
            googleSyncError: null,
            eventType: "deadline",
          },
        ],
      }),
    });
  });

  await page.route("**/api/calendar/connection-status", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        connectionStatus: {
          connected: true,
          needsReconnect: true,
          connectedEmail: "ui-review@example.com",
          connectedAt: "2026-05-01T09:00:00.000Z",
          grantedScopes: ["calendar.readonly"],
          missingScopes: ["calendar.events"],
        },
      }),
    });
  });

  await page.route("**/api/calendar/google**", async (route) => {
    const url = new URL(route.request().url());
    const action = url.searchParams.get("action");

    if (action === "events") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          events: [
            {
              id: "google-1",
              summary: "会社説明会",
              start: { dateTime: "2026-05-22T03:00:00.000Z" },
              end: { dateTime: "2026-05-22T04:00:00.000Z" },
              htmlLink: "https://calendar.google.com",
            },
          ],
        }),
      });
      return;
    }

    if (action === "suggest") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          suggestions: [
            {
              start: "2026-05-25T04:00:00.000Z",
              end: "2026-05-25T05:00:00.000Z",
              title: "志望動機の見直し",
            },
          ],
        }),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ events: [], suggestions: [] }),
    });
  });
}

async function mockDeadlinesRoute(
  page: Page,
  routePath: string,
) {
  if (routePath !== "/deadlines" && routePath !== "/dashboard") {
    return;
  }

  await page.route("**/api/deadlines**", async (route) => {
    if (route.request().method() !== "GET") {
      return route.continue();
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        deadlines: [
          {
            id: "deadline-overdue-1",
            companyId: UI_REVIEW_COMPANY.id,
            company: "東京海上日動火災保険",
            companyName: "東京海上日動火災保険",
            type: "other",
            title: "MY PAGE登録締切",
            dueDate: "2026-05-21T15:00:00.000Z",
            daysLeft: 0,
            status: "overdue",
            statusOverride: null,
            isConfirmed: true,
            completedAt: null,
            totalTasks: 3,
            completedTasks: 1,
            createdAt: "2026-03-01T09:00:00.000Z",
          },
          {
            id: "deadline-overdue-2",
            companyId: UI_REVIEW_COMPANY.id,
            company: "東京海上日動火災保険",
            companyName: "東京海上日動火災保険",
            type: "es_submission",
            title: "エントリーシート提出・大学成績データ登録送信",
            dueDate: "2026-05-22T15:00:00.000Z",
            daysLeft: 1,
            status: "overdue",
            statusOverride: null,
            isConfirmed: true,
            completedAt: null,
            totalTasks: 3,
            completedTasks: 0,
            createdAt: "2026-03-01T09:00:00.000Z",
          },
          {
            id: "deadline-overdue-3",
            companyId: UI_REVIEW_COMPANY.id,
            company: "東京海上日動火災保険",
            companyName: "東京海上日動火災保険",
            type: "web_test",
            title: "適性検査（WEB）受検",
            dueDate: "2026-05-23T15:00:00.000Z",
            daysLeft: 2,
            status: "overdue",
            statusOverride: null,
            isConfirmed: true,
            completedAt: null,
            totalTasks: 3,
            completedTasks: 0,
            createdAt: "2026-03-01T09:00:00.000Z",
          },
          {
            id: "deadline-overdue-4",
            companyId: "company-mitsui",
            company: "三井不動産",
            companyName: "三井不動産",
            type: "es_submission",
            title: "ES提出",
            dueDate: "2026-05-03T15:00:00.000Z",
            daysLeft: -18,
            status: "overdue",
            statusOverride: null,
            isConfirmed: true,
            completedAt: null,
            totalTasks: 3,
            completedTasks: 0,
            createdAt: "2026-03-01T09:00:00.000Z",
          },
        ],
        summary: {
          total: 4,
          notStarted: 0,
          inProgress: 0,
          completed: 0,
          overdue: 4,
          completionRate: 0,
        },
      }),
    });
  });
}

async function mockAuthPlanRoute(page: Page) {
  await page.route("**/api/auth/plan", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        plan: "free",
        planSelectedAt: "2026-03-01T09:00:00.000Z",
        needsPlanSelection: false,
        onboardingCompleted: true,
        needsOnboarding: false,
        hasActiveSubscription: false,
        subscriptionStatus: null,
      }),
    });
  });
}

async function mockGuestMigrationRoute(page: Page) {
  await page.route("**/api/guest/migrate", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ migrated: true }),
    });
  });
}

async function mockGakuchikaRoute(
  page: Page,
  routePath: string,
) {
  if (routePath !== "/gakuchika") {
    return;
  }

  await page.route("**/api/gakuchika", async (route) => {
    if (route.request().method() !== "GET") {
      return route.continue();
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        gakuchikas: [
          {
            id: "gakuchika-1",
            title: "学園祭運営",
            content: "150人規模の企画で進行管理を担当しました。",
            summary: null,
            conversationStatus: "in_progress",
            createdAt: "2026-03-10T09:00:00.000Z",
            updatedAt: "2026-03-15T09:00:00.000Z",
          },
        ],
        currentCount: 1,
        maxCount: 10,
      }),
    });
  });
}

async function mockTasksRoute(
  page: Page,
  routePath: string,
) {
  if (routePath !== "/tasks" && routePath !== "/dashboard") {
    return;
  }

  await page.route("**/api/tasks/today", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        mode: "DEADLINE",
        task: {
          id: "task-today-1",
          userId: "ui-review-user",
          guestId: null,
          companyId: UI_REVIEW_COMPANY.id,
          applicationId: null,
          deadlineId: "deadline-1",
          title: "ES最終確認",
          description: null,
          type: "es",
          status: "open",
          dueDate: "2026-05-21T14:00:00.000Z",
          isAutoGenerated: false,
          sortOrder: 0,
          completedAt: null,
          createdAt: "2026-03-18T09:00:00.000Z",
          updatedAt: "2026-03-18T09:00:00.000Z",
          company: {
            id: UI_REVIEW_COMPANY.id,
            name: UI_REVIEW_COMPANY.name,
          },
          application: null,
          deadline: {
            id: "deadline-1",
            title: "一次締切",
            dueDate: "2026-05-21T14:00:00.000Z",
          },
        },
      }),
    });
  });

  await page.route("**/api/tasks**", async (route) => {
    if (route.request().method() !== "GET") {
      return route.continue();
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        tasks: [
          {
            id: "task-1",
            userId: "ui-review-user",
            guestId: null,
            companyId: UI_REVIEW_COMPANY.id,
            applicationId: null,
            deadlineId: null,
            title: "企業研究メモ整理",
            description: "IR と採用サイトの差分をまとめる",
            type: "self_analysis",
            status: "open",
            dueDate: "2026-05-22T09:00:00.000Z",
            isAutoGenerated: false,
            sortOrder: 0,
            completedAt: null,
            createdAt: "2026-03-14T09:00:00.000Z",
            updatedAt: "2026-03-14T09:00:00.000Z",
            company: {
              id: UI_REVIEW_COMPANY.id,
              name: UI_REVIEW_COMPANY.name,
            },
            application: null,
            deadline: null,
          },
        ],
      }),
    });
  });
}

async function mockNotifications(page: Page) {
  await page.route("**/api/notifications**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ notifications: [], unreadCount: 0 }),
    });
  });
}

async function mockMotivationRoute(
  page: Page,
  routePath: string,
) {
  if (routePath !== `/companies/${MOTIVATION_COMPANY_ID}/motivation`) {
    return;
  }

  await page.route(`**/api/companies/${MOTIVATION_COMPANY_ID}`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        company: {
          id: MOTIVATION_COMPANY_ID,
          name: "UI Review株式会社",
          industry: "IT・通信",
        },
      }),
    });
  });

  await page.route(`**/api/companies/${MOTIVATION_COMPANY_ID}/es-role-options**`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        companyId: MOTIVATION_COMPANY_ID,
        companyName: "UI Review株式会社",
        industry: "IT・通信",
        requiresIndustrySelection: false,
        industryOptions: ["IT・通信"],
        roleGroups: [
          {
            id: "default",
            label: "職種候補",
            options: [{ value: "企画職", label: "企画職", source: "industry_default" }],
          },
        ],
      }),
    });
  });

  await page.route(`**/api/motivation/${MOTIVATION_COMPANY_ID}/conversation`, async (route) => {
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
            content: "UI Review株式会社に惹かれた理由を1つ教えてください。",
          },
        ],
        nextQuestion: "UI Review株式会社に惹かれた理由を1つ教えてください。",
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
          completedCount: 1,
          totalCount: 6,
          label: "6項目中 1 項目取得",
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

async function mockInterviewRoute(
  page: Page,
  routePath: string,
) {
  if (routePath !== `/companies/${MOTIVATION_COMPANY_ID}/interview`) {
    return;
  }

  await page.addInitScript((companyId) => {
    const key = `company-interview-session:${companyId}`;
    window.sessionStorage.setItem(
      key,
      JSON.stringify({
        messages: [
          {
            role: "assistant",
            content: "まず、UI Review株式会社を志望する理由を教えてください。",
          },
          {
            role: "user",
            content: "顧客課題に近い位置で改善を進められる点に魅力を感じています。",
          },
          {
            role: "assistant",
            content: "その中でも、特にどの事業や役割に関わりたいですか？",
          },
        ],
        questionCount: 2,
        questionStage: "company_understanding",
        stageStatus: {
          current: "company_understanding",
          completed: ["opening"],
          pending: ["experience", "motivation_fit", "feedback"],
        },
      }),
    );
  }, MOTIVATION_COMPANY_ID);

  await page.route(`**/api/companies/${MOTIVATION_COMPANY_ID}/interview`, async (route) => {
    if (route.request().method() !== "GET") {
      return route.continue();
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        company: {
          id: MOTIVATION_COMPANY_ID,
          name: "UI Review株式会社",
          industry: "IT・通信",
        },
        model: "GPT-5.4 mini",
        creditCost: 5,
        materials: [
          {
            label: "志望動機",
            text: "顧客課題の解像度を上げ、改善の打ち手を事業に近い位置で実行したい。",
            kind: "motivation",
          },
          {
            label: "ガクチカ",
            text: "学園祭運営で進行管理を担い、関係者の認識差を埋めながら実行した。",
            kind: "gakuchika",
          },
          {
            label: "関連ES",
            text: "課題整理力と巻き込み力を軸に、改善提案をやり切った経験を記載。",
            kind: "es",
          },
        ],
        stageStatus: {
          current: "opening",
          completed: [],
          pending: ["company_understanding", "experience", "motivation_fit", "feedback"],
        },
      }),
    });
  });
}

async function prepareAuthForRoute(
  page: Page,
  routePath: string,
) {
  if (authMode === "real") {
    if (!process.env.PLAYWRIGHT_AUTH_STATE) {
      throw new Error("PLAYWRIGHT_AUTH_STATE is required when --auth=real");
    }

    const sessionResponse = await page.context().request.get("/api/auth/get-session");
    const sessionBody = await sessionResponse.json().catch(() => null);
    if (!sessionBody?.user?.id) {
      throw new Error(
        [
          "PLAYWRIGHT_AUTH_STATE is present but does not contain an authenticated localhost session.",
          `route=${routePath}`,
          `sessionStatus=${sessionResponse.status()}`,
        ].join(" | "),
      );
    }
    return;
  }

  if (authMode === "guest") {
    await loginAsGuest(page);
    await ensureGuestSession(page);
    return;
  }

  if (authMode === "mock") {
    await mockAuthenticatedUser(page, {
      id: "ui-review-user",
      name: "UI Review User",
      email: "ui-review@example.com",
      plan: "free",
    });
    await mockAuthPlanRoute(page);
    await mockGuestMigrationRoute(page);
    await mockCredits(page, {
      type: "user",
      plan: "free",
      balance: 120,
      monthlyFreeCompanyRagRemaining: 493,
      monthlyFreeCompanyRagLimit: 500,
      monthlyFreeCompanyRagPdfRemaining: 600,
      monthlyFreeCompanyRagPdfLimit: 600,
    });
    await mockNotifications(page);
    await mockCompaniesRoute(page, routePath);
    await mockCompanyDetailRoute(page, routePath);
    await mockCalendarRoute(page, routePath);
    await mockDeadlinesRoute(page, routePath);
    await mockGakuchikaRoute(page, routePath);
    await mockTasksRoute(page, routePath);
    await mockMotivationRoute(page, routePath);
    await mockInterviewRoute(page, routePath);
  }
}

/** Product routes may redirect (e.g. /calendar → /calendar/connect). */
function pathnameMatchesRoute(actual: string, expected: string) {
  if (actual === expected) {
    return true;
  }
  if (expected !== "/" && actual.startsWith(`${expected}/`)) {
    return true;
  }
  return false;
}

async function expectDashboardQuickActionsVisible(page: Page) {
  const quickActions = page.getByTestId("dashboard-quick-actions");
  await expect(quickActions).toBeVisible();

  const actionBoxes = await quickActions.locator("[data-testid^='dashboard-quick-action-']").evaluateAll((nodes) =>
    nodes.map((node) => {
      const rect = node.getBoundingClientRect();
      return {
        bottom: rect.bottom,
        left: rect.left,
        right: rect.right,
        top: rect.top,
      };
    })
  );
  expect(actionBoxes).toHaveLength(5);

  const viewportWidth = await page.evaluate(() => window.innerWidth);
  for (const box of actionBoxes) {
    expect(box.left).toBeGreaterThanOrEqual(-1);
    expect(box.right).toBeLessThanOrEqual(viewportWidth + 1);
    expect(box.bottom).toBeGreaterThan(box.top);
  }
}

async function expectDashboardResponsiveLayout(page: Page, viewportWidth: number) {
  await page.waitForFunction(
    () => document.body.innerText.includes("スケジュール・選考管理"),
    undefined,
    { timeout: 30_000 },
  );

  const quickActions = page.getByTestId("dashboard-quick-actions");
  await expect(quickActions).toBeVisible();
  const firstAction = page.getByTestId("dashboard-quick-action-add-company");
  await expect(firstAction).toBeVisible();

  if (viewportWidth < 1024) {
    await expect(page.getByTestId("dashboard-mobile-logo")).toHaveCount(0);

    const sidebarToggle = page.getByTestId("mobile-sidebar-toggle");
    await expect(sidebarToggle).toBeVisible();
    const toggleBox = await sidebarToggle.evaluate((node) => {
      const rect = node.getBoundingClientRect();
      return { left: rect.left, right: rect.right };
    });
    expect(toggleBox.left).toBeLessThanOrEqual(16);
    expect(toggleBox.right).toBeLessThanOrEqual(64);
  }

  const firstActionBox = await firstAction.evaluate((node) => {
    const rect = node.getBoundingClientRect();
    return { height: rect.height, width: rect.width };
  });

  if (viewportWidth < 640) {
    expect(firstActionBox.height).toBeGreaterThanOrEqual(56);
    expect(firstActionBox.width).toBeGreaterThanOrEqual(120);
  } else if (viewportWidth < 1024) {
    expect(firstActionBox.height).toBeGreaterThanOrEqual(52);
    expect(firstActionBox.width).toBeGreaterThanOrEqual(110);
  }

  const scheduleCard = page.getByTestId("dashboard-schedule-card");
  const pipelineCard = page.getByTestId("dashboard-pipeline-card");
  await expect(scheduleCard).toBeVisible();
  await expect(pipelineCard).toBeVisible();

  const mainCards = page.locator(
    '[data-testid="dashboard-schedule-card"], [data-testid="dashboard-pipeline-card"], [data-testid="dashboard-today-task-card"], [data-testid="dashboard-deadline-card"]',
  );
  await expect(mainCards).toHaveCount(4);

  const targetCards = page.locator('[data-testid="dashboard-today-task-card"], [data-testid="dashboard-deadline-card"]');
  await expect(targetCards).toHaveCount(2);
  const cardBoxes = await targetCards.evaluateAll((nodes) =>
    nodes.map((node) => {
      const rect = node.getBoundingClientRect();
      return { bottom: rect.bottom, left: rect.left, right: rect.right, top: rect.top };
    })
  );

  for (const box of cardBoxes) {
    expect(box.left).toBeGreaterThanOrEqual(-1);
    expect(box.right).toBeLessThanOrEqual(viewportWidth + 1);
    expect(box.bottom).toBeGreaterThan(box.top);
  }
}

async function freezeCalendarClock(page: Page, routePath: string) {
  if (routePath !== "/calendar") {
    return;
  }

  await page.addInitScript((isoDate) => {
    const fixedTime = new Date(isoDate).getTime();

    class FixedDate extends Date {
      constructor(
        yearOrValue?: string | number,
        monthIndex?: number,
        date?: number,
        hours?: number,
        minutes?: number,
        seconds?: number,
        ms?: number,
      ) {
        if (yearOrValue === undefined) {
          super(fixedTime);
          return;
        }
        if (monthIndex === undefined) {
          super(yearOrValue);
          return;
        }
        if (typeof yearOrValue === "string") {
          super(yearOrValue);
          return;
        }
        super(yearOrValue, monthIndex, date ?? 1, hours ?? 0, minutes ?? 0, seconds ?? 0, ms ?? 0);
      }

      static now() {
        return fixedTime;
      }
    }

    Object.defineProperty(window, "Date", {
      configurable: true,
      value: FixedDate,
    });
  }, "2026-05-21T09:00:00+09:00");
}

async function expectCalendarInteractions(page: Page) {
  await expect(page.getByRole("heading", { name: "カレンダー" })).toBeVisible();
  await expect(page.getByText("2026年 5月")).toBeVisible();
  await expect(page.getByText("Google予定")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /タスク: ESブラッシュアップの詳細を表示/u }).first()).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByRole("button", { name: /締切: ES提出の詳細を表示/u }).first()).toBeVisible({
    timeout: 15_000,
  });

  await page.getByRole("button", { name: /2026年5月4日.*予定を追加/u }).click();
  await expect(page.getByRole("dialog", { name: "タスクを追加" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "タスクを追加" })).toBeHidden();

  await page.getByRole("button", { name: /締切: ES提出の詳細を表示/u }).first().click();
  const detailDialog = page.getByRole("dialog", { name: "ES提出" });
  await expect(detailDialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(detailDialog).toBeHidden();
}

async function expectCompanyDetailResponsiveContent(page: Page, viewportWidth: number) {
  await expect(page.getByRole("heading", { name: "三菱商事" })).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByText("画面を読み込んでいます")).toHaveCount(0);
  await expect(page.getByText("ログインが必要です。")).toHaveCount(0);

  const requiredTexts = [
    "締切・予定",
    "応募枠",
    "この企業のES",
    "企業情報データベース",
    "まだ締切が登録されていません",
    "まだ応募枠が登録されていません",
    "三菱商事 志望動機",
    "URL 493 / 500 ページ、PDF 600 / 600 ページ",
  ];
  for (const text of requiredTexts) {
    await expect(page.getByText(text).first()).toBeVisible();
  }

  const visibleLinks = [
    page.getByRole("link", { name: /志望動機/u }),
    page.getByRole("link", { name: /ES作成\/添削/u }),
    page.getByRole("link", { name: /面接対策/u }),
    page.getByRole("link", { name: /採用ページ/u }),
    page.getByRole("link", { name: /企業HP/u }),
    page.getByRole("link", { name: /マイページ/u }),
    page.getByRole("link", { name: /新規作成/u }),
  ];
  for (const link of visibleLinks) {
    await expect(link.first()).toBeVisible();
  }

  const visibleButtons = [
    page.getByRole("button", { name: /AIで選考スケジュールを取得/u }),
    page.getByRole("button", { name: "企業情報を編集" }),
    page.getByRole("button", { name: "企業を削除" }),
    page.getByRole("button", { name: "締切を追加する" }),
    page.getByRole("button", { name: "応募枠を追加" }),
    page.getByRole("button", { name: "企業情報を取得" }),
    page.getByRole("button", { name: /PWを表示/u }),
  ];
  for (const button of visibleButtons) {
    await expect(button.first()).toBeVisible();
  }

  await expect(page.getByText("企業情報データベース")).toHaveCount(1);

  const topCards = page
    .locator('[data-slot="card"]')
    .filter({ hasText: /締切・予定|応募枠|この企業のES/u });
  await expect(topCards).toHaveCount(3);

  const cardBoxes = await topCards.evaluateAll((nodes) =>
    nodes.map((node) => {
      const rect = node.getBoundingClientRect();
      return { bottom: rect.bottom, left: rect.left, right: rect.right, top: rect.top };
    }),
  );
  for (const box of cardBoxes) {
    expect(box.left).toBeGreaterThanOrEqual(-1);
    expect(box.right).toBeLessThanOrEqual(viewportWidth + 1);
    expect(box.bottom).toBeGreaterThan(box.top);
  }

  if (viewportWidth >= 768 && viewportWidth < 1024) {
    const tops = new Set(cardBoxes.map((box) => Math.round(box.top)));
    expect(tops.size).toBe(1);
  }

  if (viewportWidth >= 1024 && viewportWidth < 1280) {
    const tops = new Set(cardBoxes.map((box) => Math.round(box.top)));
    expect(tops.size).toBeGreaterThan(1);
  }

  if (viewportWidth >= 1280) {
    const tops = new Set(cardBoxes.map((box) => Math.round(box.top)));
    expect(tops.size).toBe(1);
  }
}

for (const routePath of reviewPaths) {
  for (const viewport of viewports) {
    test(`ui review ${viewport.name} ${routePath}`, async ({ page }) => {
      test.setTimeout(90_000);

      await page.setViewportSize({
        height: viewport.height,
        width: viewport.width,
      });
      await prepareAuthForRoute(page, routePath);
      await freezeCalendarClock(page, routePath);

      await page.goto(routePath, { waitUntil: "domcontentloaded", timeout: 90_000 });
      await page.waitForTimeout(1_200);

      expect(pathnameMatchesRoute(new URL(page.url()).pathname, routePath)).toBe(true);

      await expect(page.locator("body")).toBeVisible({ timeout: 15_000 });

      if (routePath === "/deadlines" && authMode === "mock") {
        await expect(page.getByText("MY PAGE登録締切")).toBeVisible({
          timeout: 15_000,
        });
        const snackbarClose = page.getByRole("button", { name: "通知を閉じる" });
        if (await snackbarClose.isVisible().catch(() => false)) {
          await snackbarClose.click();
        }
      }

      const main = page.locator("main").first();
      try {
        await main.waitFor({ state: "visible", timeout: 45_000 });
      } catch {
        await expect(page.locator("body")).not.toContainText("画面を読み込んでいます", {
          timeout: 10_000,
        });
      }

      const overflow = await page.evaluate(() => ({
        body: Math.max(document.body.scrollWidth, document.documentElement.scrollWidth),
        viewport: window.innerWidth,
      }));
      expect(overflow.body).toBeLessThanOrEqual(overflow.viewport + 2);

      if (routePath === "/dashboard" && viewport.width >= 1100) {
        await expectDashboardQuickActionsVisible(page);
      }

      if (routePath === "/dashboard") {
        await expectDashboardResponsiveLayout(page, viewport.width);
      }

      if (routePath === "/calendar" && authMode === "mock") {
        await expectCalendarInteractions(page);
      }

      if (routePath === `/companies/${MOTIVATION_COMPANY_ID}` && authMode === "mock") {
        await expectCompanyDetailResponsiveContent(page, viewport.width);
      }

      const lateSnackbarClose = page.getByRole("button", { name: "通知を閉じる" });
      if (await lateSnackbarClose.isVisible().catch(() => false)) {
        await lateSnackbarClose.click();
        await page.waitForTimeout(300);
      }
      await page.addStyleTag({
        content:
          "[data-app-snackbar-root], [data-app-snackbar], nextjs-portal, [data-nextjs-toast], [data-nextjs-dev-tools-button] { display: none !important; }",
      });

      await page
        .waitForFunction(() => !document.body.innerText.includes("Compiling"), undefined, { timeout: 10_000 })
        .catch(() => undefined);

      await fs.mkdir(screenshotDir, { recursive: true });
      await page.screenshot({
        fullPage: true,
        path: path.join(
          screenshotDir,
          `${slugifyUiReviewPath(routePath)}-${viewport.name}.png`
        ),
      });
    });
  }
}
