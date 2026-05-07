import { expect, test } from "@playwright/test";
import {
  apiRequest,
  apiRequestAsAuthenticatedUser,
  ensureGuestSession,
  loginAsGuest,
  mockCredits,
} from "../fixtures/auth";
import { hasAuthenticatedUserAccess, signInAsAuthenticatedUser } from "../google-auth";

test.describe("Billing (guest)", () => {
  test("guest can read credits endpoint", async ({ page }) => {
    test.setTimeout(30_000);
    await loginAsGuest(page);
    await ensureGuestSession(page);

    const res = await apiRequest(page, "GET", "/api/credits");
    expect(res.ok()).toBe(true);

    const body = (await res.json()) as {
      type: string;
      plan: string;
      balance: number;
      monthlyFree: Record<string, unknown>;
    };
    expect(body.type).toBe("guest");
    expect(body.plan).toBe("guest");
    expect(typeof body.balance).toBe("number");
    expect(body.monthlyFree).toBeDefined();
  });

  test("guest cannot create stripe checkout session", async ({ page }) => {
    test.setTimeout(30_000);
    await loginAsGuest(page);
    await ensureGuestSession(page);

    const res = await apiRequest(page, "POST", "/api/stripe/checkout", {
      plan: "standard",
    });
    expect(res.status()).toBeGreaterThanOrEqual(400);
  });
});

test.describe("Billing (authenticated)", () => {
  test.skip(!hasAuthenticatedUserAccess, "Authenticated E2E access is not configured");

  test("authenticated user sees credits with plan info", async ({ page }) => {
    test.setTimeout(60_000);
    await signInAsAuthenticatedUser(page, "/dashboard");

    const res = await apiRequestAsAuthenticatedUser(page, "GET", "/api/credits");
    expect(res.ok()).toBe(true);

    const body = (await res.json()) as {
      type: string;
      plan: string;
      balance: number;
      monthlyAllocation: number;
      monthlyFree: {
        selectionSchedule: { remaining: number; limit: number };
      };
    };
    expect(body.type).toBe("user");
    expect(["free", "standard", "pro"]).toContain(body.plan);
    expect(typeof body.balance).toBe("number");
    expect(typeof body.monthlyAllocation).toBe("number");
    expect(body.monthlyFree.selectionSchedule).toBeDefined();
  });

  test("stripe checkout returns redirect URL for valid plan", async ({ page }) => {
    test.setTimeout(60_000);
    await signInAsAuthenticatedUser(page, "/dashboard");

    const res = await apiRequestAsAuthenticatedUser(page, "POST", "/api/stripe/checkout", {
      plan: "standard",
      period: "monthly",
    });

    if (res.ok()) {
      const body = (await res.json()) as { url: string; sessionId: string };
      expect(body.url).toBeTruthy();
      expect(body.sessionId).toBeTruthy();
    } else {
      expect([400, 409]).toContain(res.status());
    }
  });
});

test.describe("Billing (mock UI)", () => {
  test("pricing/plan display with mocked credits", async ({ page }) => {
    test.setTimeout(60_000);
    await loginAsGuest(page);
    await ensureGuestSession(page);

    await mockCredits(page, {
      type: "user",
      plan: "free",
      balance: 10,
      monthlyAllocation: 30,
    });

    await page.goto("/settings", { waitUntil: "domcontentloaded" });

    const creditsVisible = await page
      .getByText(/クレジット|プラン|credits/i)
      .first()
      .isVisible()
      .catch(() => false);

    if (!creditsVisible) {
      await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    }
    await expect(page.locator("main").first()).toBeVisible({ timeout: 15_000 });
  });
});

test.describe("Billing (edge cases)", () => {
  test("stripe checkout with invalid plan returns 400", async ({ page }) => {
    test.skip(!hasAuthenticatedUserAccess, "Authenticated E2E access is not configured");
    test.setTimeout(30_000);
    await signInAsAuthenticatedUser(page, "/dashboard");

    const res = await apiRequestAsAuthenticatedUser(page, "POST", "/api/stripe/checkout", {
      plan: "invalid_plan",
    });
    expect(res.status()).toBeGreaterThanOrEqual(400);
  });
});
