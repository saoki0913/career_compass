import { expect, test } from "@playwright/test";
import { apiRequest, ensureGuestSession, loginAsGuest, navigateTo } from "./fixtures/auth";

const allowWrites = process.env.PLAYWRIGHT_SMOKE_ALLOW_WRITES === "1";

type CompanyResponse = {
  company: {
    id: string;
    name: string;
  };
};

type DeadlineResponse = {
  deadlines: Array<{
    id: string;
    title: string;
  }>;
};

type DocumentResponse = {
  document: {
    id: string;
    title: string;
  };
};

type GakuchikaResponse = {
  gakuchika: {
    id: string;
    title: string;
  };
};

type RoleOptionsResponse = {
  roleGroups: Array<{
    options: Array<{
      value: string;
    }>;
  }>;
};

type MotivationStartResponse = {
  question?: string;
  nextQuestion?: string;
  error?: string;
};

type DashboardIncompleteResponse = {
  draftESCount: number;
  inProgressGakuchikaCount: number;
};

test.describe("Release Smoke", () => {
  test("homepage renders", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/就活Pass/);
    await expect(page.locator("main")).toBeVisible();
  });

  test("login page renders login surface", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByAltText("就活Pass").first()).toBeVisible();
  });

  test("guest can open companies page", async ({ page }) => {
    await loginAsGuest(page);
    await navigateTo(page, "/companies");
    await expect(page.locator("main")).toBeVisible();
  });

  test("new company page renders when write smoke is enabled", async ({ page }) => {
    test.skip(!allowWrites, "Write smoke is enabled only for local verification.");

    await loginAsGuest(page);
    await navigateTo(page, "/companies/new");
    await expect(page.locator("main")).toBeVisible();
  });

  test("guest regression flow covers company, deadlines, tasks, documents, and gakuchika", async ({
    page,
  }) => {
    test.skip(!allowWrites, "Write smoke must be explicitly enabled.");
    test.setTimeout(60_000);

    await loginAsGuest(page);
    await ensureGuestSession(page);

    const unique = `release-smoke-${Date.now()}`;
    let companyId: string | null = null;
    let deadlineId: string | null = null;
    let gakuchikaId: string | null = null;

    try {
      const companyCreate = await apiRequest(page, "POST", "/api/companies", {
        name: unique,
        industry: "IT・ソフトウェア",
      });
      expect(companyCreate.ok()).toBeTruthy();
      const companyPayload = (await companyCreate.json()) as CompanyResponse;
      companyId = companyPayload.company.id;

      const companyDetail = await apiRequest(page, "GET", `/api/companies/${companyId}`);
      expect(companyDetail.ok()).toBeTruthy();
      const companyDetailPayload = (await companyDetail.json()) as CompanyResponse;
      expect(companyDetailPayload.company.name).toBe(unique);

      const deadlinesCreate = await apiRequest(page, "POST", `/api/companies/${companyId}/deadlines`, {
        type: "es_submission",
        title: `${unique}-deadline`,
        dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      });
      expect(deadlinesCreate.ok()).toBeTruthy();

      const deadlinesList = await apiRequest(page, "GET", `/api/companies/${companyId}/deadlines`);
      expect(deadlinesList.ok()).toBeTruthy();
      const deadlinesPayload = (await deadlinesList.json()) as DeadlineResponse;
      deadlineId = deadlinesPayload.deadlines[0]?.id ?? null;
      expect(deadlinesPayload.deadlines.some((deadline) => deadline.title === `${unique}-deadline`)).toBeTruthy();

      const roleOptions = await apiRequest(
        page,
        "GET",
        `/api/companies/${companyId}/es-role-options?industry=${encodeURIComponent("IT・通信")}`
      );
      expect(roleOptions.ok()).toBeTruthy();
      const roleOptionsPayload = (await roleOptions.json()) as RoleOptionsResponse;
      const selectedRole = roleOptionsPayload.roleGroups.flatMap((group) => group.options)[0]?.value;
      expect(selectedRole).toBeTruthy();

      const motivationStart = await apiRequest(
        page,
        "POST",
        `/api/motivation/${companyId}/conversation/start`,
        {
          selectedIndustry: "IT・通信",
          selectedRole,
          roleSelectionSource: "industry_default",
        }
      );
      expect(motivationStart.ok()).toBeTruthy();
      const motivationPayload = (await motivationStart.json()) as MotivationStartResponse;
      expect(
        Math.max(
          motivationPayload.question?.length ?? 0,
          motivationPayload.nextQuestion?.length ?? 0
        )
      ).toBeGreaterThan(0);

      const todayTask = await apiRequest(page, "GET", "/api/tasks/today");
      expect(todayTask.ok()).toBeTruthy();

      const documentCreate = await apiRequest(page, "POST", "/api/documents", {
        title: `${unique}-es`,
        type: "es",
        companyId,
        content: [
          {
            id: `${unique}-block`,
            type: "paragraph",
            content: "ゲスト smoke 用の ES 下書きです。",
          },
        ],
      });
      expect(documentCreate.ok()).toBeTruthy();
      const documentPayload = (await documentCreate.json()) as DocumentResponse;
      expect(documentPayload.document.title).toBe(`${unique}-es`);

      const dashboardIncomplete = await apiRequest(page, "GET", "/api/dashboard/incomplete");
      expect(dashboardIncomplete.ok()).toBeTruthy();
      const dashboardIncompletePayload =
        (await dashboardIncomplete.json()) as DashboardIncompleteResponse;
      expect(dashboardIncompletePayload.draftESCount).toBeGreaterThan(0);

      const gakuchikaCreate = await apiRequest(page, "POST", "/api/gakuchika", {
        title: `${unique}-gakuchika`,
        content: "学生時代に力を入れたことの smoke 検証です。",
        charLimitType: "400",
      });
      expect(gakuchikaCreate.ok()).toBeTruthy();
      const gakuchikaPayload = (await gakuchikaCreate.json()) as GakuchikaResponse;
      gakuchikaId = gakuchikaPayload.gakuchika.id;

      const gakuchikaDetail = await apiRequest(page, "GET", `/api/gakuchika/${gakuchikaId}`);
      expect(gakuchikaDetail.ok()).toBeTruthy();

      const dashboardIncompleteAfterGakuchika = await apiRequest(page, "GET", "/api/dashboard/incomplete");
      expect(dashboardIncompleteAfterGakuchika.ok()).toBeTruthy();
      const dashboardIncompleteAfterGakuchikaPayload =
        (await dashboardIncompleteAfterGakuchika.json()) as DashboardIncompleteResponse;
      expect(dashboardIncompleteAfterGakuchikaPayload.inProgressGakuchikaCount).toBeGreaterThan(0);

      const calendarStatus = await apiRequest(page, "GET", "/api/calendar/connection-status");
      expect([401, 403].includes(calendarStatus.status())).toBeTruthy();

      await navigateTo(page, "/dashboard");
      await expect(page.locator("main")).toBeVisible();

      await navigateTo(page, "/companies");
      await expect(page.locator("body")).toContainText(unique);

      await navigateTo(page, "/tasks");
      await expect(page.locator("main")).toBeVisible();
    } finally {
      if (deadlineId) {
        await apiRequest(page, "DELETE", `/api/deadlines/${deadlineId}`);
      }
      if (companyId) {
        await apiRequest(page, "DELETE", `/api/companies/${companyId}`);
      }
      if (gakuchikaId) {
        await apiRequest(page, "DELETE", `/api/gakuchika/${gakuchikaId}`);
      }
    }
  });
});
