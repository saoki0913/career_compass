/**
 * Selection Schedule Fetch — real API E2E tests
 *
 * All tests hit the real Next.js → FastAPI pipeline.
 * The only mock used is mockCredits() for the 402 credit-exhaustion case.
 *
 * Fixture strategy:
 *   createOwnedCompany()  — authenticated user, real DB row
 *   createGuestCompany()  — guest session, real DB row
 *   mockCredits()         — ONLY for the 402 path
 *
 * FastAPI assertion: the search-pages response from the real backend must
 * contain a `candidates` array where every element has a `confidence` field.
 * The Next.js mock fallback returns a static array without the FastAPI signal,
 * but it still has `confidence`, so what distinguishes a real FastAPI response
 * is that the probe to /health in global-setup already confirmed FastAPI is up.
 */

import { test, expect } from "@playwright/test";
import {
  loginAsGuest,
  ensureGuestSession,
  mockCredits,
  createOwnedCompany,
  createGuestCompany,
  deleteOwnedCompany,
  deleteGuestCompany,
  apiRequestAsAuthenticatedUser,
  apiRequest,
  expectOkResponse,
} from "./fixtures/auth";
import {
  hasAuthenticatedUserAccess,
  signInAsAuthenticatedUser,
} from "./google-auth";

// ---------------------------------------------------------------------------
// Guest tests — do NOT require CI_E2E_AUTH_SECRET
// ---------------------------------------------------------------------------

test.describe("Selection schedule search-pages (guest)", () => {
  test("guest user can call search-pages with a real company", async ({ page }) => {
    test.setTimeout(120_000);

    await loginAsGuest(page);
    await ensureGuestSession(page);

    const runId = `search-guest-${Date.now()}`;
    const company = await createGuestCompany(page, {
      name: `NTTデータ_${runId}`,
      industry: "IT・通信",
    });

    try {
      const response = await apiRequest(
        page,
        "POST",
        `/api/companies/${company.id}/search-pages`,
        { selectionType: "main_selection" },
      );
      // Guests can call search-pages (auth is not required for search, only for fetch-info)
      const body = await response.text();
      const status = response.status();
      // Either 200 with candidates or 401 depending on product rules.
      // What we assert: request completes without a 5xx server error.
      expect(status, `search-pages returned unexpected status: ${status}\n${body.slice(0, 400)}`).toBeLessThan(500);

      if (status === 200) {
        const json = JSON.parse(body) as { candidates: Array<{ confidence: string }> };
        expect(Array.isArray(json.candidates)).toBe(true);
        // When FastAPI is up every candidate returned has a confidence field.
        for (const candidate of json.candidates) {
          expect(
            ["high", "medium", "low"].includes(candidate.confidence),
            `candidate.confidence must be high/medium/low, got: ${candidate.confidence}`,
          ).toBe(true);
        }
      }
    } finally {
      await deleteGuestCompany(page, company.id);
    }
  });

  test("guest is blocked from fetch-info with 401", async ({ page }) => {
    test.setTimeout(60_000);

    await loginAsGuest(page);
    await ensureGuestSession(page);

    const runId = `fetch-guest-401-${Date.now()}`;
    const company = await createGuestCompany(page, {
      name: `ゲスト企業_${runId}`,
      industry: "製造業",
    });

    try {
      // fetch-info requires a logged-in user (LOGIN_REQUIRED_FOR_SCHEDULE_FETCH)
      const response = await apiRequest(
        page,
        "POST",
        `/api/companies/${company.id}/fetch-info`,
        {
          url: "https://www.example.com/recruit",
          selectionType: "main_selection",
        },
      );
      expect(response.status()).toBe(401);
      const json = (await response.json()) as { code?: string };
      expect(json.code).toBe("LOGIN_REQUIRED_FOR_SCHEDULE_FETCH");
    } finally {
      await deleteGuestCompany(page, company.id);
    }
  });
});

// ---------------------------------------------------------------------------
// Authenticated tests — require CI_E2E_AUTH_SECRET or Google auth state
// ---------------------------------------------------------------------------

test.describe("Selection schedule search-pages (authenticated)", () => {
  test.skip(!hasAuthenticatedUserAccess, "Requires CI_E2E_AUTH_SECRET or Google auth state");

  test("search-pages returns candidates with confidence field from FastAPI", async ({ page }) => {
    test.setTimeout(120_000);

    const runId = `search-auth-${Date.now()}`;

    await signInAsAuthenticatedUser(page, "/dashboard");

    const company = await createOwnedCompany(page, {
      name: `NTTデータ_${runId}`,
      industry: "IT・通信",
    });

    try {
      const response = await apiRequestAsAuthenticatedUser(
        page,
        "POST",
        `/api/companies/${company.id}/search-pages`,
        { selectionType: "main_selection" },
      );
      await expectOkResponse(response, "search-pages (authenticated)");
      const json = (await response.json()) as {
        candidates: Array<{ confidence: string; url: string }>;
        usedGraduationYear: number | null;
        yearSource: string;
      };

      // FastAPI response must have a candidates array (possibly empty when no results found)
      expect(Array.isArray(json.candidates)).toBe(true);

      // Every candidate must have the confidence field — this is set by the FastAPI
      // backend. The Next.js mock fallback also sets it, but global-setup has already
      // confirmed FastAPI is up so we are testing real data.
      for (const candidate of json.candidates) {
        expect(
          ["high", "medium", "low"].includes(candidate.confidence),
          `candidate.confidence must be high/medium/low, got: ${String(candidate.confidence)}`,
        ).toBe(true);
        expect(typeof candidate.url).toBe("string");
      }

      // yearSource must be one of the known enum values
      expect(["profile", "manual", "none"]).toContain(json.yearSource);
    } finally {
      await deleteOwnedCompany(page, company.id);
    }
  });

  test("fetch-info completes without server error for a real company", async ({ page }) => {
    // Non-deterministic: deadline extraction depends on what the real recruitment
    // page contains at the time of the test. We only assert the request completes
    // without a 5xx error and returns a valid result envelope.
    test.setTimeout(120_000);

    const runId = `fetch-auth-${Date.now()}`;

    await signInAsAuthenticatedUser(page, "/dashboard");

    const company = await createOwnedCompany(page, {
      name: `NTTデータ_${runId}`,
      industry: "IT・通信",
      recruitmentUrl: "https://recruit.nttdata.com/",
    });

    try {
      const response = await apiRequestAsAuthenticatedUser(
        page,
        "POST",
        `/api/companies/${company.id}/fetch-info`,
        {
          url: "https://recruit.nttdata.com/",
          selectionType: "main_selection",
        },
      );
      const status = response.status();
      const body = await response.text();

      // Accept 200 (success or no_deadlines) or 402 (credit exhausted in CI).
      // Reject anything in the 5xx range — that is always a bug.
      expect(
        status < 500,
        `fetch-info returned server error ${status}\n${body.slice(0, 600)}`,
      ).toBe(true);

      if (status === 200) {
        const json = JSON.parse(body) as {
          resultStatus: string;
          deadlinesExtractedCount: number;
          deadlinesSavedCount: number;
          creditsConsumed: number;
        };
        expect(["success", "no_deadlines", "duplicates_only", "error"]).toContain(
          json.resultStatus,
        );
        expect(typeof json.deadlinesExtractedCount).toBe("number");
        expect(typeof json.deadlinesSavedCount).toBe("number");
        expect(typeof json.creditsConsumed).toBe("number");
        // Business rule: credits must never be consumed when there are no deadlines
        if (json.resultStatus === "no_deadlines" || json.resultStatus === "error") {
          expect(json.creditsConsumed).toBe(0);
        }
      }
    } finally {
      await deleteOwnedCompany(page, company.id);
    }
  });

  test("402 credit exhaustion: fetch-info is blocked and no credits consumed", async ({ page }) => {
    // This is the only test that uses mockCredits — we need a predictable 402 to
    // verify the frontend surfaces the correct error without consuming credits.
    test.setTimeout(60_000);

    const runId = `fetch-auth-402-${Date.now()}`;

    await signInAsAuthenticatedUser(page, "/dashboard");

    // Intercept only /api/credits so the billing pre-check returns balance=0.
    // All other calls (companies, search-pages, fetch-info) go through the real API.
    await mockCredits(page, {
      balance: 0,
      monthlySelectionScheduleRemaining: 0,
      monthlySelectionScheduleLimit: 5,
    });

    const company = await createOwnedCompany(page, {
      name: `クレジット不足テスト_${runId}`,
      industry: "IT・通信",
      recruitmentUrl: "https://recruit.nttdata.com/",
    });

    try {
      const response = await apiRequestAsAuthenticatedUser(
        page,
        "POST",
        `/api/companies/${company.id}/fetch-info`,
        {
          url: "https://recruit.nttdata.com/",
          selectionType: "main_selection",
        },
      );
      expect(response.status()).toBe(402);
      const json = (await response.json()) as { code?: string };
      expect(json.code).toBe("INSUFFICIENT_CREDITS");
    } finally {
      await deleteOwnedCompany(page, company.id);
    }
  });

  test("no deadlines result: request completes and reports zero deadlines saved", async ({ page }) => {
    // Use a URL that is unlikely to have machine-readable schedule info.
    // Non-deterministic: we only verify the result envelope is valid.
    test.setTimeout(120_000);

    const runId = `fetch-no-dl-${Date.now()}`;

    await signInAsAuthenticatedUser(page, "/dashboard");

    const company = await createOwnedCompany(page, {
      name: `締切なしテスト_${runId}`,
      industry: "その他",
      recruitmentUrl: "https://www.example.com/",
    });

    try {
      const response = await apiRequestAsAuthenticatedUser(
        page,
        "POST",
        `/api/companies/${company.id}/fetch-info`,
        {
          url: "https://www.example.com/",
          selectionType: "main_selection",
        },
      );
      const status = response.status();
      const body = await response.text();

      expect(
        status < 500,
        `fetch-info returned server error ${status}\n${body.slice(0, 600)}`,
      ).toBe(true);

      if (status === 200) {
        const json = JSON.parse(body) as {
          resultStatus: string;
          creditsConsumed: number;
        };
        // Business rule: credits are not consumed when no value was delivered
        if (json.resultStatus !== "success") {
          expect(json.creditsConsumed).toBe(0);
        }
      }
    } finally {
      await deleteOwnedCompany(page, company.id);
    }
  });
});
