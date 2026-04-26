import { expect, test, type Page } from "@playwright/test";

import { loginAsGuest, mockAuthenticatedUser, mockCredits } from "../fixtures/auth";

type MockCompany = {
  id: string;
  name: string;
  industry: string | null;
  recruitmentUrl: string | null;
  corporateUrl: string | null;
  mypageUrl: string | null;
  mypageLoginId: string | null;
  hasCredentials: boolean;
  notes: string | null;
  status: "inbox";
  createdAt: string;
  updatedAt: string;
};

type MockApplication = {
  id: string;
  companyId: string;
  name: string;
  type: "main";
  status: "active";
  phase: string[];
  sortOrder: number;
  deadlineCount: number;
  nearestDeadline: string | null;
  createdAt: string;
  updatedAt: string;
};

type MockSubmission = {
  id: string;
  userId: string | null;
  guestId: string | null;
  applicationId: string;
  type: "other";
  name: string;
  isRequired: boolean;
  status: "not_started" | "in_progress" | "completed";
  fileUrl: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

function makeCompany(id: string, name: string): MockCompany {
  const now = new Date().toISOString();
  return {
    id,
    name,
    industry: "IT・ソフトウェア",
    recruitmentUrl: "https://example.com/recruit",
    corporateUrl: "https://example.com/corporate",
    mypageUrl: null,
    mypageLoginId: null,
    hasCredentials: false,
    notes: null,
    status: "inbox",
    createdAt: now,
    updatedAt: now,
  };
}

function buildCorporateStatus(params: {
  companyId: string;
  pageLimit?: number;
  corporateInfoUrls?: Array<Record<string, unknown>>;
  totalChunks?: number;
}) {
  return {
    companyId: params.companyId,
    corporateInfoUrls: params.corporateInfoUrls ?? [],
    corporateInfoFetchedAt: params.corporateInfoUrls?.length ? new Date().toISOString() : null,
    ragStatus: {
      hasRag: (params.corporateInfoUrls?.length ?? 0) > 0,
      totalChunks: params.totalChunks ?? 0,
      newGradRecruitmentChunks: 0,
      midcareerRecruitmentChunks: 0,
      corporateSiteChunks: params.totalChunks ?? 0,
      irMaterialsChunks: 0,
      ceoMessageChunks: 0,
      employeeInterviewsChunks: 0,
      pressReleaseChunks: 0,
      csrSustainabilityChunks: 0,
      midtermPlanChunks: 0,
      lastUpdated: null,
    },
    pageLimit: params.pageLimit ?? 5,
  };
}

async function mockShellApis(page: Page) {
  await page.route("**/api/notifications**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ notifications: [], unreadCount: 0 }),
    });
  });
}

async function setupGuest(page: Page) {
  await loginAsGuest(page);
  await mockShellApis(page);
}

async function setupAuthenticated(page: Page) {
  await mockAuthenticatedUser(page, {
    id: "user-e2e",
    name: "E2E User",
    email: "e2e@example.com",
    plan: "standard",
  });
  await mockShellApis(page);
}

async function mockCompanyDetailApis(page: Page, company: MockCompany) {
  let applications: MockApplication[] = [];
  const submissionsByApplication = new Map<string, MockSubmission[]>();
  let corporateStatus = buildCorporateStatus({ companyId: company.id, pageLimit: 20 });

  await page.route(`**/api/companies/${company.id}/credentials`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ mypageLoginId: null, mypagePassword: null }),
    });
  });

  await page.route(`**/api/companies/${company.id}/deadlines`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ deadlines: [] }),
    });
  });

  await page.route(`**/api/companies/${company.id}/applications`, async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ applications }),
      });
      return;
    }

    const input = route.request().postDataJSON() as { name: string };
    const now = new Date().toISOString();
    const nextApplication: MockApplication = {
      id: "app-e2e",
      companyId: company.id,
      name: input.name,
      type: "main",
      status: "active",
      phase: [],
      sortOrder: applications.length,
      deadlineCount: 0,
      nearestDeadline: null,
      createdAt: now,
      updatedAt: now,
    };
    applications = [nextApplication];
    submissionsByApplication.set(nextApplication.id, []);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ application: nextApplication }),
    });
  });

  await page.route("**/api/applications/app-e2e", async (route) => {
    const input = route.request().postDataJSON() as Partial<MockApplication>;
    applications = applications.map((application) =>
      application.id === "app-e2e"
        ? {
            ...application,
            ...input,
            updatedAt: new Date().toISOString(),
          }
        : application,
    );
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ application: applications[0] }),
    });
  });

  await page.route("**/api/applications/app-e2e/submissions", async (route) => {
    const current = submissionsByApplication.get("app-e2e") ?? [];

    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ submissions: current }),
      });
      return;
    }

    const input = route.request().postDataJSON() as { name: string };
    const nextSubmission: MockSubmission = {
      id: "submission-e2e",
      userId: "user-e2e",
      guestId: null,
      applicationId: "app-e2e",
      type: "other",
      name: input.name,
      isRequired: false,
      status: "not_started",
      fileUrl: null,
      notes: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    submissionsByApplication.set("app-e2e", [...current, nextSubmission]);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ submission: nextSubmission }),
    });
  });

  await page.route("**/api/submissions/submission-e2e", async (route) => {
    if (route.request().method() === "DELETE") {
      submissionsByApplication.set("app-e2e", []);
      await route.fulfill({ status: 204, body: "" });
      return;
    }

    const input = route.request().postDataJSON() as Partial<MockSubmission>;
    const next = {
      ...(submissionsByApplication.get("app-e2e")?.[0] ?? {
        id: "submission-e2e",
        userId: "user-e2e",
        guestId: null,
        applicationId: "app-e2e",
        type: "other" as const,
        name: "追加資料",
        isRequired: false,
        status: "not_started" as const,
        fileUrl: null,
        notes: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }),
      ...input,
      updatedAt: new Date().toISOString(),
    };
    submissionsByApplication.set("app-e2e", [next]);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ submission: next }),
    });
  });

  await page.route(`**/api/documents?companyId=${company.id}&type=es`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ documents: [] }),
    });
  });

  await page.route(`**/api/companies/${company.id}/fetch-corporate`, async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(corporateStatus),
      });
      return;
    }

    corporateStatus = buildCorporateStatus({
      companyId: company.id,
      pageLimit: 20,
      corporateInfoUrls: [
        {
          url: "https://example.com/company",
          kind: "url",
          contentType: "corporate_site",
          secondaryContentTypes: [],
          status: "completed",
          fetchedAt: new Date().toISOString(),
          trustedForEsReview: true,
        },
      ],
      totalChunks: 8,
    });

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        pagesCrawled: 1,
        chunksStored: 8,
        actualUnits: 8,
        freeUnitsApplied: 8,
        remainingFreeUnits: 292,
        creditsConsumed: 0,
        actualCreditsDeducted: 0,
        estimatedCostBand: "無料枠内",
        errors: [],
        totalUrls: 1,
      }),
    });
  });

  await page.route(`**/api/companies/${company.id}/fetch-corporate/estimate`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        estimated_free_pages: 1,
        estimated_credits: 0,
        requires_confirmation: false,
        processing_notice_ja: null,
      }),
    });
  });

  await page.route(`**/api/companies/${company.id}/search-corporate-pages`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        candidates: [
          {
            url: "https://example.com/company",
            title: "会社概要",
            snippet: "事業内容と会社概要",
            confidence: "high",
            sourceType: "official",
          },
        ],
      }),
    });
  });

  await page.route(`**/api/companies/${company.id}/fetch-corporate-upload`, async (route) => {
    corporateStatus = buildCorporateStatus({
      companyId: company.id,
      pageLimit: 20,
      corporateInfoUrls: [
        {
          url: "https://example.com/company",
          kind: "url",
          contentType: "corporate_site",
          secondaryContentTypes: [],
          status: "completed",
          fetchedAt: new Date().toISOString(),
          trustedForEsReview: true,
        },
        {
          url: "upload://corporate-pdf/demo",
          kind: "upload_pdf",
          fileName: "company.pdf",
          contentType: "ir_materials",
          secondaryContentTypes: [],
          status: "completed",
          fetchedAt: new Date().toISOString(),
          trustedForEsReview: true,
        },
      ],
      totalChunks: 18,
    });

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        summary: {
          total: 1,
          completed: 1,
          pending: 0,
          failed: 0,
          skippedLimit: 0,
        },
        items: [
          {
            fileName: "company.pdf",
            status: "completed",
            chunksStored: 10,
            ingestUnits: 10,
            creditsConsumed: 0,
            actualCreditsDeducted: 0,
            extractionMethod: "pypdf",
            contentType: "ir_materials",
          },
        ],
        totalSources: 2,
        totalUnits: 10,
        remainingFreeUnits: 310,
        actualCreditsDeducted: 0,
        estimatedCostBand: "無料枠内",
      }),
    });
  });

  await page.route(`**/api/companies/${company.id}/fetch-corporate-upload/estimate`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        company_id: company.id,
        source_url: `upload://corporate-pdf/${company.id}/company.pdf`,
        page_count: 4,
        source_total_pages: 4,
        estimated_free_pdf_pages: 4,
        estimated_credits: 0,
        estimated_google_ocr_pages: 0,
        estimated_mistral_ocr_pages: 0,
        will_truncate: false,
        requires_confirmation: false,
        processing_notice_ja: "summary",
        page_routing_summary: {
          total_pages: 4,
          ingest_pages: 4,
          local_pages: 4,
          google_ocr_pages: 0,
          mistral_ocr_pages: 0,
          truncated_pages: 0,
          planned_route: ["local"],
          actual_route: ["local"],
        },
      }),
    });
  });

  await page.route(`**/api/companies/${company.id}`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ company }),
    });
  });
}

async function mockESApis(page: Page, documentId: string, company: MockCompany) {
  const document = {
    id: documentId,
    userId: "user-e2e",
    guestId: null,
    companyId: company.id,
    applicationId: null,
    jobTypeId: null,
    type: "es",
    esCategory: "standard",
    title: `${company.name} ES`,
    content: [
      { id: "q1", type: "h2", content: "学生時代に力を入れたこと", charLimit: 400 },
      {
        id: "a1",
        type: "paragraph",
        content: "私は大学祭実行委員として、チームの進行管理を見直し、準備の遅延を減らしました。",
      },
    ],
    status: "draft",
    deletedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    company: {
      id: company.id,
      name: company.name,
      corporateInfoFetchedAt: new Date().toISOString(),
    },
  };

  await page.route(`**/api/documents/${documentId}/threads`, async (route) => {
    if (route.request().method() === "POST") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ threads: [] }),
    });
  });

  await page.route(`**/api/documents/${documentId}/review/stream`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body:
        'data: {"type":"progress","step":"analysis","progress":40,"label":"分析中"}\n\n' +
        'data: {"type":"string_chunk","path":"streaming_rewrite","text":"改善案を作成しています。"}\n\n' +
        'data: {"type":"complete","creditCost":1,"result":{"top3":[{"category":"構成","issue":"結論を先に出すと伝わりやすいです。","suggestion":"最初の一文で成果を明示してください。"}],"rewrites":["成果を先に書く形へ整えました。"],"review_meta":{}}}\n\n',
    });
  });

  await page.route(`**/api/companies/${company.id}/es-review-status*`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        companyId: company.id,
        companyName: company.name,
        status: "ready_for_es_review",
        hasCompanyRag: true,
      }),
    });
  });

  await page.route(`**/api/companies/${company.id}/es-role-options*`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        companyId: company.id,
        companyName: company.name,
        industry: "IT・ソフトウェア",
        requiresIndustrySelection: false,
        industryOptions: ["IT・ソフトウェア"],
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

  await page.route(`**/api/documents/${documentId}`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ document }),
    });
  });
}

async function chooseEsReviewRole(page: Page) {
  const rolePicker = page
    .getByText("職種を選択してください")
    .locator("..")
    .getByRole("combobox");
  await expect(rolePicker).toBeEnabled({ timeout: 10_000 });
  await rolePicker.click();
  await page.getByRole("option", { name: "企画職" }).click();
}

test.describe("bug regressions", () => {
  test("企業名選択で業界が自動反映される", async ({ page }) => {
    await setupGuest(page);

    await page.route("**/api/companies", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ companies: [], plan: "guest", limit: 3 }),
      });
    });
    await page.route("**/api/companies/suggestions?*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          suggestions: [{ name: "テスト通信株式会社", industry: "IT・通信" }],
        }),
      });
    });

    await page.goto("/companies/new");
    await page.getByLabel("企業名 *").fill("テスト");
    await page.getByText("テスト通信株式会社").click();
    await expect(page.getByRole("combobox").first()).toContainText("IT・通信");
  });

  test("応募枠編集モーダルで提出物追加しても勝手に保存されない", async ({ page }) => {
    await setupAuthenticated(page);
    await mockCredits(page, { balance: 120, plan: "standard" });
    const company = makeCompany("company-app", "応募枠回帰株式会社");
    await mockCompanyDetailApis(page, company);

    await page.goto(`/companies/${company.id}`);
    await page.getByRole("button", { name: "応募枠を追加" }).click();
    await page.getByLabel("応募枠名 *").fill("本選考");
    await page.getByLabel("応募枠名 *").press("Enter");

    const applicationButton = page.getByRole("button", { name: /本選考/ }).first();
    await expect(applicationButton).toBeVisible();
    await applicationButton.click();
    await expect(page.getByText("応募枠を編集")).toBeVisible();

    const applicationModal = page.locator(".fixed.inset-0.z-50").filter({ hasText: "応募枠を編集" });
    await applicationModal.getByRole("button", { name: "追加", exact: true }).first().click();
    await page.getByPlaceholder("名前（例: 志望動機ES）").fill("追加資料");
    await applicationModal.getByRole("button", { name: "追加", exact: true }).last().click();

    await expect(page.getByText("応募枠を編集")).toBeVisible();
    await expect(page.getByText("追加資料")).toBeVisible();
    await expect(page.getByRole("button", { name: "保存" })).toBeVisible();
  });

  test("ログイン済み表示ではクレジットと企業RAG無料枠を出し、ログイン必須文言は出さない", async ({ page }) => {
    await setupAuthenticated(page);
    await mockCredits(page, {
      balance: 120,
      plan: "standard",
      monthlyFreeCompanyRagRemaining: 60,
      monthlyFreeCompanyRagLimit: 100,
    });
    const company = makeCompany("company-rag", "表示回帰株式会社");
    await mockCompanyDetailApis(page, company);

    await page.goto("/dashboard");
    await expect(page.locator('a[href="/pricing"]').filter({ hasText: "120" }).first()).toBeVisible();

    await page.goto(`/companies/${company.id}`);
    await expect(page.getByText("今月の企業RAG無料枠")).toBeVisible();
    await expect(page.getByText(/企業RAG取込はログインユーザー向け機能です/)).toHaveCount(0);
  });

  test("企業詳細からES作成への遷移で進行表示が出てモーダルが開く", async ({ page }) => {
    await setupAuthenticated(page);
    await mockCredits(page, { balance: 50, plan: "standard" });
    const company = makeCompany("company-es", "ES遷移回帰株式会社");
    await mockCompanyDetailApis(page, company);
    await page.route("**/api/companies", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 200));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ companies: [company], plan: "standard", limit: null }),
      });
    });
    await page.route("**/api/documents?type=es", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 200));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ documents: [] }),
      });
    });

    await page.goto(`/companies/${company.id}`);
    const start = Date.now();
    await page.getByRole("link", { name: "ESを作成する" }).click();
    await expect(
      page.getByRole("dialog").filter({ hasText: "新しいESを作成" }),
    ).toBeVisible({ timeout: 20_000 });
    expect(Date.now() - start).toBeLessThan(35_000);
    await expect(page.getByText(company.name).first()).toBeVisible();
  });

  test("企業情報取得とPDF取込の結果がモーダルに反映される", async ({ page }) => {
    await setupAuthenticated(page);
    await mockCredits(page, {
      balance: 50,
      plan: "standard",
      monthlyFreeCompanyRagRemaining: 60,
      monthlyFreeCompanyRagLimit: 100,
    });
    const company = makeCompany("company-fetch", "企業情報回帰株式会社");
    await mockCompanyDetailApis(page, company);

    await page.goto(`/companies/${company.id}`);
    await page.getByRole("button", { name: "企業情報を取得" }).click();
    await page.selectOption("select", "corporate_site");
    await page.getByRole("button", { name: /^検索$/ }).first().click();
    await page.getByRole("button", { name: "選択したURLを取得" }).click();
    const closeButton = page.getByRole("button", { name: "閉じる", exact: true });
    if (await closeButton.count()) {
      await closeButton.click();
    }

    await page.getByRole("button", { name: "企業情報を取得" }).click();
    await page.getByRole("button", { name: "資料アップロード" }).click();
    await page.setInputFiles('input[type="file"]', {
      name: "company.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n"),
    });
    await page.getByRole("button", { name: "1件を取り込む" }).click();

    await expect(page.getByRole("button", { name: "登録済みソースを見る" })).toBeVisible({ timeout: 15000 });
    await expect(page.getByText("企業RAGへの取り込みが完了しました")).toBeVisible({ timeout: 20000 });
  });

  test("ES添削は残高不足で開始できず、開始時はページ先頭へ戻る", async ({ page }) => {
    await setupAuthenticated(page);
    const company = makeCompany("company-review", "添削回帰株式会社");
    await mockESApis(page, "doc-review", company);

    await mockCredits(page, { balance: 0, plan: "free" });
    await page.goto("/es/doc-review");
    await page.getByRole("button", { name: "この設問をAI添削" }).first().click();
    await chooseEsReviewRole(page);
    await page.getByRole("button", { name: "この設問をAI添削" }).last().click();
    await expect(page.getByRole("button", { name: "クレジット不足" })).toBeVisible();

    await mockCredits(page, { balance: 10, plan: "free" });
    await page.reload();
    await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight, behavior: "auto" }));
    await page.getByRole("button", { name: "この設問をAI添削" }).first().click();
    await chooseEsReviewRole(page);
    await page.getByRole("button", { name: "この設問をAI添削" }).last().click();
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeLessThan(80);
    await expect(page.getByText("添削完了")).toBeVisible({ timeout: 10000 });
  });

  test("ES添削の条件不足は未設定項目を赤表示して要約する", async ({ page }) => {
    await setupAuthenticated(page);
    const company = makeCompany("company-review-validation", "添削条件株式会社");
    await mockESApis(page, "doc-review-validation", company);
    await mockCredits(page, { balance: 10, plan: "free" });

    await page.goto("/es/doc-review-validation");
    await page.getByRole("button", { name: "この設問をAI添削" }).first().click();
    await page.getByRole("button", { name: "この設問をAI添削" }).last().click();

    await expect(page.getByText("赤字の枠内を入力・選択してください。")).toBeVisible();
    await expect(page.getByText("先に職種を選択してください。")).toHaveCount(2);
    await expect(page.locator('[aria-invalid="true"]')).toHaveCount(2);
  });

  test("カレンダー連携案内とホーム戻り導線が見える", async ({ page }) => {
    await setupAuthenticated(page);
    await page.route("**/api/calendar/**", async (route) => {
      const url = route.request().url();
      if (url.includes("/api/calendar/events")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ events: [] }),
        });
        return;
      }
      if (url.includes("/api/calendar/connection-status")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ connected: false, needsReconnect: false }),
        });
        return;
      }
      if (url.includes("/api/calendar/settings")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            settings: {
              provider: "app",
              targetCalendarId: null,
              freebusyCalendarIds: [],
            },
            connectionStatus: { connected: false, needsReconnect: false },
            syncSummary: { pendingCount: 0, failedCount: 0, lastFailureReason: null },
          }),
        });
        return;
      }
      if (url.includes("/api/calendar/calendars")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ calendars: [] }),
        });
        return;
      }
      await route.fulfill({ status: 200, body: "{}" });
    });

    await page.goto("/calendar/connect?returnTo=%2Fcalendar%2Fsettings");
    await expect(page.getByText("Googleカレンダーを連携").last()).toBeVisible();
    await expect(page.getByRole("link", { name: "Google で連携する" })).toHaveAttribute(
      "href",
      /\/api\/calendar\/connect\?returnTo=%2Fcalendar%2Fsettings/,
    );

    await page.goto("/calendar");
    await expect(page.getByRole("link", { name: "ホームに戻る" })).toBeVisible();
  });
});
