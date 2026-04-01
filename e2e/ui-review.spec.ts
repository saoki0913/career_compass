import fs from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";
import {
  ensureGuestSession,
  loginAsGuest,
  mockAuthenticatedUser,
  mockCredits,
} from "./fixtures/auth";
import { parseUiReviewPaths, slugifyUiReviewPath } from "../src/lib/ui-review-cli.mjs";

const authMode = process.env.PLAYWRIGHT_UI_AUTH_MODE?.trim() || "none";
const reviewPaths = parseUiReviewPaths(process.env.PLAYWRIGHT_UI_PATHS);
const screenshotDir = path.join(process.cwd(), "test-results", "ui-review");

const viewports = [
  { height: 740, name: "mobile-narrow", width: 320 },
  { height: 844, name: "mobile", width: 390 },
  { height: 1024, name: "tablet", width: 768 },
  { height: 900, name: "laptop", width: 1024 },
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

async function mockCompaniesRoute(
  page: Parameters<typeof test>[0]["page"],
  routePath: string,
) {
  if (!routePath.startsWith("/companies")) {
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

async function mockCalendarRoute(
  page: Parameters<typeof test>[0]["page"],
  routePath: string,
) {
  if (routePath !== "/calendar") {
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
            startAt: "2026-03-18T10:00:00.000Z",
            endAt: "2026-03-18T11:30:00.000Z",
            createdAt: "2026-03-10T09:00:00.000Z",
            updatedAt: "2026-03-10T09:00:00.000Z",
          },
        ],
        deadlines: [
          {
            id: "deadline-1",
            title: "一次締切",
            type: "entry_sheet",
            dueDate: "2026-03-20T14:00:00.000Z",
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
          needsReconnect: false,
          connectedEmail: "ui-review@example.com",
          connectedAt: "2026-03-01T09:00:00.000Z",
          grantedScopes: ["calendar.readonly"],
          missingScopes: [],
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
              start: { dateTime: "2026-03-22T03:00:00.000Z" },
              end: { dateTime: "2026-03-22T04:00:00.000Z" },
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
              start: "2026-03-25T04:00:00.000Z",
              end: "2026-03-25T05:00:00.000Z",
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

async function mockGakuchikaRoute(
  page: Parameters<typeof test>[0]["page"],
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
  page: Parameters<typeof test>[0]["page"],
  routePath: string,
) {
  if (routePath !== "/tasks") {
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
          dueDate: "2026-03-20T14:00:00.000Z",
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
            dueDate: "2026-03-20T14:00:00.000Z",
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
            dueDate: "2026-03-25T09:00:00.000Z",
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

async function mockNotifications(page: Parameters<typeof test>[0]["page"]) {
  await page.route("**/api/notifications**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ notifications: [], unreadCount: 0 }),
    });
  });
}

async function mockMotivationRoute(
  page: Parameters<typeof test>[0]["page"],
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
        suggestionOptions: [
          {
            id: "option-1",
            label: "業務改革を通じて顧客課題を解決できる点に惹かれたため",
            sourceType: "company",
            intent: "company_reason",
            rationale: "企業固有の特徴に直接触れる候補",
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

async function mockInterviewRoute(
  page: Parameters<typeof test>[0]["page"],
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
  page: Parameters<typeof test>[0]["page"],
  routePath: string,
) {
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
    await mockCredits(page, { type: "user", plan: "free", balance: 120 });
    await mockNotifications(page);
    await mockCompaniesRoute(page, routePath);
    await mockCalendarRoute(page, routePath);
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

for (const routePath of reviewPaths) {
  for (const viewport of viewports) {
    test(`ui review ${viewport.name} ${routePath}`, async ({ page }) => {
      test.setTimeout(90_000);

      await page.setViewportSize({
        height: viewport.height,
        width: viewport.width,
      });
      await prepareAuthForRoute(page, routePath);

      await page.goto(routePath, { waitUntil: "domcontentloaded", timeout: 90_000 });
      await page.waitForTimeout(1_200);

      expect(pathnameMatchesRoute(new URL(page.url()).pathname, routePath)).toBe(true);

      await expect(page.locator("body")).toBeVisible({ timeout: 15_000 });

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
