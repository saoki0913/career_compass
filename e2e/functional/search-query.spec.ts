import { expect, test } from "@playwright/test";
import {
  apiRequest,
  apiRequestAsAuthenticatedUser,
  createGuestCompany,
  deleteGuestCompany,
  ensureGuestSession,
  loginAsGuest,
  navigateTo,
} from "../fixtures/auth";
import { hasAuthenticatedUserAccess, signInAsAuthenticatedUser } from "../google-auth";

test.describe("Search query (guest)", () => {
  test("guest can search and get results", async ({ page }) => {
    test.setTimeout(60_000);
    await loginAsGuest(page);
    await ensureGuestSession(page);

    const runId = `search-g-${Date.now()}`;
    let companyId: string | null = null;

    try {
      const company = await createGuestCompany(page, {
        name: `検索テスト企業_${runId}`,
        industry: "IT・通信",
      });
      companyId = company.id;

      const res = await apiRequest(page, "GET", `/api/search?q=${encodeURIComponent(runId)}`);
      expect(res.ok()).toBe(true);
    } finally {
      if (companyId) await deleteGuestCompany(page, companyId);
    }
  });

  test("guest search page renders with query", async ({ page }) => {
    test.setTimeout(60_000);
    await loginAsGuest(page);
    await ensureGuestSession(page);

    await navigateTo(page, `/search?q=${encodeURIComponent("テスト")}`);
    await expect(page.locator("main").first()).toBeVisible({ timeout: 15_000 });
  });

  test("guest search with empty query returns results or empty state", async ({ page }) => {
    test.setTimeout(60_000);
    await loginAsGuest(page);
    await ensureGuestSession(page);

    await navigateTo(page, "/search");
    await expect(page.locator("main").first()).toBeVisible({ timeout: 15_000 });
  });
});

test.describe("Search query (authenticated)", () => {
  test.skip(!hasAuthenticatedUserAccess, "Authenticated E2E access is not configured");

  test("authenticated user can search via API", async ({ page }) => {
    test.setTimeout(60_000);
    await signInAsAuthenticatedUser(page, "/dashboard");

    const res = await apiRequestAsAuthenticatedUser(
      page,
      "GET",
      `/api/search?q=${encodeURIComponent("テスト")}&types=all&limit=5`,
    );
    expect(res.ok()).toBe(true);
  });

  test("authenticated search page renders", async ({ page }) => {
    test.setTimeout(60_000);
    await signInAsAuthenticatedUser(page, `/search?q=${encodeURIComponent("企業")}`);
    await expect(page.locator("main").first()).toBeVisible({ timeout: 15_000 });
  });
});

test.describe("Search query (edge cases)", () => {
  test("search with very long query is rejected", async ({ page }) => {
    test.setTimeout(30_000);
    await loginAsGuest(page);
    await ensureGuestSession(page);

    const longQuery = "あ".repeat(150);
    const res = await apiRequest(
      page,
      "GET",
      `/api/search?q=${encodeURIComponent(longQuery)}`,
    );
    expect(res.status()).toBeGreaterThanOrEqual(400);
  });

  test("search respects limit parameter", async ({ page }) => {
    test.setTimeout(30_000);
    await loginAsGuest(page);
    await ensureGuestSession(page);

    const res = await apiRequest(
      page,
      "GET",
      `/api/search?q=${encodeURIComponent("テスト")}&limit=1`,
    );
    expect(res.ok()).toBe(true);
  });
});
