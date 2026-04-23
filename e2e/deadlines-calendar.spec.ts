import { test, expect } from "@playwright/test";
import {
  loginAsGuest,
  ensureGuestSession,
  navigateTo,
  createOwnedCompany,
  createOwnedDeadline,
  deleteOwnedDeadline,
  deleteOwnedCompany,
} from "./fixtures/auth";
import { hasAuthenticatedUserAccess, signInAsAuthenticatedUser } from "./google-auth";

test.describe("Deadlines page (guest)", () => {
  test("guest can access deadlines page", async ({ page }) => {
    await loginAsGuest(page);
    await ensureGuestSession(page);
    await navigateTo(page, "/deadlines");

    await expect(page.getByText("締切管理")).toBeVisible();
  });
});

test.describe("Deadlines page (authenticated)", () => {
  test("renders deadlines page with heading", async ({ page }) => {
    test.skip(!hasAuthenticatedUserAccess, "Requires CI_E2E_AUTH_SECRET or Google auth state");
    test.setTimeout(60_000);
    await signInAsAuthenticatedUser(page, "/deadlines");

    await expect(page.getByText("締切管理")).toBeVisible({ timeout: 10_000 });
  });

  test("renders deadline list with created test data", async ({ page }) => {
    test.skip(!hasAuthenticatedUserAccess, "Requires CI_E2E_AUTH_SECRET or Google auth state");
    test.setTimeout(90_000);
    await signInAsAuthenticatedUser(page, "/deadlines");

    const company = await createOwnedCompany(page, {
      name: "締切テスト企業E2E",
      industry: "IT・通信",
    });
    let deadlineId = "";

    try {
      const deadline = await createOwnedDeadline(page, company.id, {
        type: "es_submission",
        title: "E2Eテスト締切",
        dueDate: "2027-06-15",
      });
      deadlineId = deadline.id;

      await page.reload({ waitUntil: "domcontentloaded" });
      await expect(page.getByText("E2Eテスト締切")).toBeVisible({ timeout: 10_000 });
    } finally {
      if (deadlineId) {
        await deleteOwnedDeadline(page, deadlineId).catch(() => {});
      }
      await deleteOwnedCompany(page, company.id).catch(() => {});
    }
  });
});

test.describe("Calendar page (authenticated)", () => {
  test("renders calendar with weekday headers", async ({ page }) => {
    test.skip(!hasAuthenticatedUserAccess, "Requires CI_E2E_AUTH_SECRET or Google auth state");
    test.setTimeout(60_000);
    await signInAsAuthenticatedUser(page, "/calendar");

    await expect(page.getByText("カレンダー").first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("日").first()).toBeVisible();
    await expect(page.getByText("月").first()).toBeVisible();
    await expect(page.getByText("火").first()).toBeVisible();
    await expect(page.getByText("水").first()).toBeVisible();
    await expect(page.getByText("木").first()).toBeVisible();
    await expect(page.getByText("金").first()).toBeVisible();
    await expect(page.getByText("土").first()).toBeVisible();
  });

  test("calendar has settings link", async ({ page }) => {
    test.skip(!hasAuthenticatedUserAccess, "Requires CI_E2E_AUTH_SECRET or Google auth state");
    test.setTimeout(60_000);
    await signInAsAuthenticatedUser(page, "/calendar");

    await expect(page.getByText("カレンダー").first()).toBeVisible({ timeout: 10_000 });
    const settingsLink = page.getByText("設定").first();
    await expect(settingsLink).toBeVisible();
  });

  test("calendar settings page shows Google Calendar connection options", async ({ page }) => {
    test.skip(!hasAuthenticatedUserAccess, "Requires CI_E2E_AUTH_SECRET or Google auth state");
    test.setTimeout(60_000);
    await signInAsAuthenticatedUser(page, "/calendar/settings");

    await expect(page.getByText("カレンダー設定")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("Googleカレンダー連携")).toBeVisible();
  });
});

test.describe("Calendar page (guest)", () => {
  test("guest is redirected from calendar settings", async ({ page }) => {
    await loginAsGuest(page);
    await ensureGuestSession(page);

    await page.goto("/calendar/settings");
    await page.waitForTimeout(1000);
    expect(
      page.url().includes("/login") ||
        (await page.getByText(/ログイン|認証/i).first().isVisible().catch(() => false)),
    ).toBeTruthy();
  });
});
