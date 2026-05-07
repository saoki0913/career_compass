import { expect, test } from "@playwright/test";
import {
  apiRequest,
  apiRequestAsAuthenticatedUser,
  createGuestCompany,
  createOwnedCompany,
  deleteGuestCompany,
  deleteOwnedCompany,
  ensureGuestSession,
  loginAsGuest,
  navigateTo,
} from "../fixtures/auth";
import { hasAuthenticatedUserAccess, signInAsAuthenticatedUser } from "../google-auth";

test.describe("Company CRUD (guest)", () => {
  test("guest can create and list a company", async ({ page }) => {
    test.setTimeout(60_000);
    await loginAsGuest(page);
    await ensureGuestSession(page);

    const runId = `crud-g-${Date.now()}`;
    let companyId: string | null = null;

    try {
      const company = await createGuestCompany(page, {
        name: `テスト株式会社_${runId}`,
        industry: "IT・通信",
      });
      companyId = company.id;
      expect(company.name).toContain(runId);

      const listRes = await apiRequest(page, "GET", "/api/companies");
      expect(listRes.ok()).toBe(true);
      const body = (await listRes.json()) as { companies: Array<{ id: string; name: string }> };
      expect(body.companies.some((c) => c.id === companyId)).toBe(true);
    } finally {
      if (companyId) await deleteGuestCompany(page, companyId);
    }
  });

  test("guest can delete a company", async ({ page }) => {
    test.setTimeout(60_000);
    await loginAsGuest(page);
    await ensureGuestSession(page);

    const runId = `crud-del-${Date.now()}`;
    const company = await createGuestCompany(page, {
      name: `削除テスト_${runId}`,
    });

    const delRes = await apiRequest(page, "DELETE", `/api/companies/${company.id}`);
    expect(delRes.ok()).toBe(true);

    const listRes = await apiRequest(page, "GET", "/api/companies");
    const body = (await listRes.json()) as { companies: Array<{ id: string }> };
    expect(body.companies.some((c) => c.id === company.id)).toBe(false);
  });

  test("guest sees companies page with company list", async ({ page }) => {
    test.setTimeout(60_000);
    await loginAsGuest(page);
    await ensureGuestSession(page);

    const runId = `crud-ui-${Date.now()}`;
    let companyId: string | null = null;

    try {
      const company = await createGuestCompany(page, {
        name: `UI表示テスト_${runId}`,
        industry: "金融",
      });
      companyId = company.id;

      await navigateTo(page, "/companies");
      await expect(page.getByText(company.name)).toBeVisible({ timeout: 15_000 });
    } finally {
      if (companyId) await deleteGuestCompany(page, companyId);
    }
  });
});

test.describe("Company CRUD (authenticated)", () => {
  test.skip(!hasAuthenticatedUserAccess, "Authenticated E2E access is not configured");

  test("authenticated user can create, update, and delete a company", async ({ page }) => {
    test.setTimeout(90_000);
    const runId = `crud-auth-${Date.now()}`;
    let companyId: string | null = null;

    try {
      await signInAsAuthenticatedUser(page, "/companies");

      const company = await createOwnedCompany(page, {
        name: `認証テスト_${runId}`,
        industry: "メーカー",
      });
      companyId = company.id;

      const updateRes = await apiRequestAsAuthenticatedUser(
        page,
        "PATCH",
        `/api/companies/${companyId}`,
        { notes: "更新テスト" },
      );
      expect(updateRes.ok()).toBe(true);

      const getRes = await apiRequestAsAuthenticatedUser(
        page,
        "GET",
        `/api/companies/${companyId}`,
      );
      expect(getRes.ok()).toBe(true);
      const detail = (await getRes.json()) as { company: { notes: string } };
      expect(detail.company.notes).toBe("更新テスト");

      await deleteOwnedCompany(page, companyId);
      companyId = null;
    } finally {
      if (companyId) await deleteOwnedCompany(page, companyId);
    }
  });

  test("company list page renders for authenticated user", async ({ page }) => {
    test.setTimeout(90_000);
    await signInAsAuthenticatedUser(page, "/companies");
    await expect(page.locator("main").first()).toBeVisible({ timeout: 15_000 });
  });
});

test.describe("Company CRUD (edge cases)", () => {
  test("creating company without name returns 400", async ({ page }) => {
    test.setTimeout(30_000);
    await loginAsGuest(page);
    await ensureGuestSession(page);

    const res = await apiRequest(page, "POST", "/api/companies", {});
    expect(res.status()).toBeGreaterThanOrEqual(400);
  });

  test("GET non-existent company returns 404", async ({ page }) => {
    test.setTimeout(30_000);
    await loginAsGuest(page);
    await ensureGuestSession(page);

    const res = await apiRequest(page, "GET", "/api/companies/nonexistent-id-000");
    expect(res.status()).toBe(404);
  });
});
