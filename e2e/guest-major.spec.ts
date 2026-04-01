import { expect, test } from "@playwright/test";
import {
  apiRequest,
  createGuestApplication,
  createGuestDeadline,
  createGuestNotification,
  createGuestSubmission,
  createGuestCompany,
  createGuestDocument,
  createGuestTask,
  deleteGuestDeadline,
  deleteGuestCompany,
  deleteGuestDocument,
  deleteGuestApplication,
  deleteGuestNotification,
  deleteGuestSubmission,
  deleteGuestTask,
  ensureGuestSession,
  expectOkResponse,
  loginAsGuest,
  navigateTo,
} from "./fixtures/auth";

type RoleOptionsResponse = {
  roleGroups: Array<{
    options: Array<{
      value: string;
    }>;
  }>;
};

type SearchResponse = {
  results: {
    companies: Array<{ name: string }>;
    documents: Array<{ title: string }>;
    deadlines: Array<{ title: string }>;
  };
};

test.describe("Guest major flow", () => {
  test("covers guest core product flows with created data", async ({ page }) => {
    test.setTimeout(120_000);

    const runId = `guest-major-${Date.now()}`;
    const companyName = `主要導線会社_${runId}`;
    const applicationName = `本選考_${runId}`;
    const submissionName = `提出物_${runId}`;
    const deadlineTitle = `ES締切_${runId}`;
    const documentTitle = `ES下書き_${runId}`;
    const taskTitle = `自己分析_${runId}`;
    const notificationTitle = `通知_${runId}`;

    let companyId: string | null = null;
    let applicationId: string | null = null;
    let submissionId: string | null = null;
    let deadlineId: string | null = null;
    let documentId: string | null = null;
    let taskId: string | null = null;
    let notificationId: string | null = null;

    await loginAsGuest(page);
    await ensureGuestSession(page);

    try {
      await navigateTo(page, "/dashboard");
      await expect(page.locator("main").first()).toBeVisible();

      const company = await createGuestCompany(page, {
        name: companyName,
        industry: "IT・ソフトウェア",
      });
      companyId = company.id;

      const application = await createGuestApplication(page, companyId, {
        name: applicationName,
        type: "main",
      });
      applicationId = application.id;

      const submission = await createGuestSubmission(page, applicationId, {
        type: "other",
        name: submissionName,
        isRequired: true,
      });
      submissionId = submission.id;

      const deadline = await createGuestDeadline(page, companyId, {
        type: "es_submission",
        title: deadlineTitle,
        memo: `${runId} memo`,
        dueDate: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
      });
      deadlineId = deadline.id;

      const task = await createGuestTask(page, {
        title: taskTitle,
        type: "self_analysis",
        companyId,
        applicationId,
        dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      });
      taskId = task.id;

      const document = await createGuestDocument(page, {
        title: documentTitle,
        type: "es",
        companyId,
        content: [
          {
            id: `${runId}-block`,
            type: "paragraph",
            content: "主要導線確認用の ES 下書きです。",
          },
        ],
      });
      documentId = document.id;

      const notification = await createGuestNotification(page, {
        type: "deadline_reminder",
        title: notificationTitle,
        message: `${deadlineTitle} を確認してください`,
      });
      notificationId = notification.id;

      const roleOptionsResponse = await apiRequest(
        page,
        "GET",
        `/api/companies/${companyId}/es-role-options?industry=${encodeURIComponent("IT・通信")}`
      );
      const roleOptionsPayload = JSON.parse(
        await expectOkResponse(roleOptionsResponse, "motivation role options")
      ) as RoleOptionsResponse;
      const selectedRole = roleOptionsPayload.roleGroups.flatMap((group) => group.options)[0]?.value;
      expect(selectedRole).toBeTruthy();

      const applicationsResponse = await apiRequest(page, "GET", `/api/companies/${companyId}/applications`);
      await expect(
        Promise.resolve(JSON.parse(await expectOkResponse(applicationsResponse, "applications list")))
      ).resolves.toMatchObject({
        applications: expect.arrayContaining([
          expect.objectContaining({ id: applicationId, name: applicationName }),
        ]),
      });

      const submissionsResponse = await apiRequest(page, "GET", `/api/applications/${applicationId}/submissions`);
      await expect(
        Promise.resolve(JSON.parse(await expectOkResponse(submissionsResponse, "submissions list")))
      ).resolves.toMatchObject({
        submissions: expect.arrayContaining([
          expect.objectContaining({ id: submissionId, name: submissionName }),
        ]),
      });

      const searchResponse = await apiRequest(page, "GET", `/api/search?q=${encodeURIComponent(runId)}`);
      const searchPayload = JSON.parse(
        await expectOkResponse(searchResponse, "search")
      ) as SearchResponse;
      expect(searchPayload.results.companies.some((item) => item.name === companyName)).toBeTruthy();
      expect(searchPayload.results.documents.some((item) => item.title === documentTitle)).toBeTruthy();
      expect(searchPayload.results.deadlines.some((item) => item.title === deadlineTitle)).toBeTruthy();

      await navigateTo(page, "/companies");
      await expect(page.locator("body")).toContainText(companyName);

      await navigateTo(page, `/companies/${companyId}`);
      await expect(page.locator("body")).toContainText(companyName);
      await expect(page.locator("body")).toContainText(applicationName);
      await expect(page.locator("body")).toContainText(deadlineTitle);

      await navigateTo(page, `/companies/${companyId}/motivation`);
      await expect(page.locator("main").first()).toBeVisible();
      await expect(page.locator("body")).toContainText(
        /志望動機|志望動機ESを作成|志望動機のAI支援はログイン/,
      );

      await navigateTo(page, "/es");
      await expect(page.locator("body")).toContainText(documentTitle);

      await navigateTo(page, `/es/${documentId}`);
      await expect(page.locator("main").first()).toBeVisible();

      await navigateTo(page, "/gakuchika");
      await expect(page.locator("main").first()).toBeVisible();

      await navigateTo(page, "/tasks");
      await expect(page.locator("body")).toContainText(taskTitle);
      await expect(page.locator("body")).toContainText(companyName);

      await navigateTo(page, `/search?q=${encodeURIComponent(runId)}`);
      await expect(page.locator("main")).toBeVisible();
      await expect(page.locator("body")).toContainText(/検索キーワード|検索できます/);

      await navigateTo(page, "/notifications");
      await expect(page.locator("body")).toContainText(notificationTitle);

      await navigateTo(page, "/dashboard");
      await expect(page.locator("main").first()).toBeVisible();
      await expect(page.locator("body")).toContainText(companyName);

      await page.goto("/calendar");
      await page.waitForTimeout(1000);
      expect(
        page.url().includes("/login") ||
          (await page.getByText(/ログイン|認証/i).first().isVisible().catch(() => false))
      ).toBeTruthy();

      await page.goto("/settings");
      await page.waitForTimeout(1000);
      expect(
        page.url().includes("/login") ||
          (await page.getByText(/ログイン|認証/i).first().isVisible().catch(() => false))
      ).toBeTruthy();
    } finally {
      if (notificationId) {
        await deleteGuestNotification(page, notificationId);
      }
      if (taskId) {
        await deleteGuestTask(page, taskId);
      }
      if (documentId) {
        await deleteGuestDocument(page, documentId);
      }
      if (deadlineId) {
        await deleteGuestDeadline(page, deadlineId);
      }
      if (submissionId) {
        await deleteGuestSubmission(page, submissionId);
      }
      if (applicationId) {
        await deleteGuestApplication(page, applicationId);
      }
      if (companyId) {
        await deleteGuestCompany(page, companyId);
      }
    }
  });
});
