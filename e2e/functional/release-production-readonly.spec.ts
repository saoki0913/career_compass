import { expect, test, type Page } from "@playwright/test";
import { hasAuthenticatedUserAccess, signInAsAuthenticatedUser } from "../google-auth";

const productionCompanyId = process.env.E2E_PRODUCTION_COMPANY_ID?.trim();
const strictReadonly = process.env.RELEASE_PRODUCTION_READONLY_STRICT === "1";
const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const SAFE_WRITE_API_RE = /\/api\/(?:auth|internal|csrf|contact|activation)\b/u;
const unexpectedWritesByPage = new WeakMap<Page, string[]>();

function watchUnexpectedWrites(page: Page): string[] {
  const writes: string[] = [];
  page.on("request", (request) => {
    if (!WRITE_METHODS.has(request.method())) {
      return;
    }
    const url = request.url();
    if (url.includes("/api/") && !SAFE_WRITE_API_RE.test(url)) {
      writes.push(`${request.method()} ${url}`);
    }
  });
  return writes;
}

test.describe("Production release smoke", () => {
  test.beforeEach(async ({ page }) => {
    const writes = watchUnexpectedWrites(page);
    unexpectedWritesByPage.set(page, writes);
  });

  test.afterEach(async ({ page }) => {
    const writes = unexpectedWritesByPage.get(page) || [];
    expect(writes, `Production readonly smoke must not issue product write requests:\n${writes.join("\n")}`).toEqual([]);
  });

  test("public surfaces are reachable", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("body")).toContainText(/就活|ES|ガクチカ|志望動機/);

    await page.goto("/pricing");
    await expect(page.locator("main")).toBeVisible();

    await page.goto("/terms");
    await expect(page.locator("main")).toBeVisible();

    await page.goto("/privacy");
    await expect(page.locator("main")).toBeVisible();
  });

  test("authenticated read-only surfaces load when auth state exists", async ({ page }) => {
    test.skip(!strictReadonly && !hasAuthenticatedUserAccess, "Authenticated E2E access is not configured");
    expect(hasAuthenticatedUserAccess, "RELEASE_PRODUCTION_READONLY_STRICT requires CI E2E auth or Google auth storage state").toBeTruthy();

    await signInAsAuthenticatedUser(page, "/dashboard");
    await expect(page.locator("main")).toBeVisible();

    await page.goto("/companies");
    await expect(page.locator("main")).toBeVisible();

    await page.goto("/tasks");
    await expect(page.locator("main")).toBeVisible();

    await page.goto("/search?q=就活");
    await expect(page.locator("main")).toBeVisible();

    await page.goto("/settings");
    await expect(page.locator("main")).toBeVisible();

    await page.goto("/profile");
    await expect(page.locator("main")).toBeVisible();

    const creditsStatus = await page.evaluate(async () => {
      const response = await fetch("/api/credits", { method: "GET", credentials: "include" });
      return response.status;
    });
    expect(creditsStatus, "/api/credits read should succeed in production readonly smoke").toBeLessThan(400);
  });

  test("company detail loads when E2E_PRODUCTION_COMPANY_ID is set", async ({ page }) => {
    test.skip(!strictReadonly && (!hasAuthenticatedUserAccess || !productionCompanyId), "Set auth access and E2E_PRODUCTION_COMPANY_ID to cover /companies/[id] SSR + DB");
    expect(hasAuthenticatedUserAccess, "RELEASE_PRODUCTION_READONLY_STRICT requires CI E2E auth or Google auth storage state").toBeTruthy();
    expect(productionCompanyId, "RELEASE_PRODUCTION_READONLY_STRICT requires E2E_PRODUCTION_COMPANY_ID").toBeTruthy();

    await signInAsAuthenticatedUser(page, "/dashboard");
    await page.goto(`/companies/${productionCompanyId}`, { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(new RegExp(`/companies/${productionCompanyId}`));
    await expect(page.locator("main")).toBeVisible({ timeout: 20_000 });
    await expect(page.locator("body")).not.toContainText(/This page couldn.t load|server error occurred/i);
  });
});
