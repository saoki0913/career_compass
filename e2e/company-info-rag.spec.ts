/**
 * Corporate info RAG — real API E2E tests
 *
 * All tests hit the real Next.js → FastAPI pipeline.
 * No page.route() mocks are used.
 *
 * Fixture strategy:
 *   createOwnedCompany()  — authenticated user, real DB row
 *   createGuestCompany()  — guest session, real DB row
 *
 * FastAPI assertion: the search-corporate-pages response must contain a
 * `candidates` array where every element has a `confidence` field.
 * The Next.js fallback for a downed FastAPI returns an empty array;
 * global-setup has already confirmed FastAPI is up before these tests run.
 */

import { test, expect } from "@playwright/test";
import {
  loginAsGuest,
  ensureGuestSession,
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
// Guest tests
// ---------------------------------------------------------------------------

test.describe("Corporate info RAG (guest)", () => {
  test("guest is blocked from fetch-corporate with 401", async ({ page }) => {
    test.setTimeout(60_000);

    await loginAsGuest(page);
    await ensureGuestSession(page);

    const runId = `rag-guest-${Date.now()}`;
    const company = await createGuestCompany(page, {
      name: `RAGゲスト企業_${runId}`,
      industry: "IT・通信",
      corporateUrl: "https://www.nttdata.com/",
    });

    try {
      const response = await apiRequest(
        page,
        "POST",
        `/api/companies/${company.id}/fetch-corporate`,
        { urls: ["https://www.nttdata.com/jp/ja/about-us/"], contentType: "about" },
      );
      // fetch-corporate is an authenticated-only feature
      expect(response.status()).toBe(401);
    } finally {
      await deleteGuestCompany(page, company.id);
    }
  });

  test("guest can call search-corporate-pages and receives a valid response", async ({ page }) => {
    test.setTimeout(120_000);

    await loginAsGuest(page);
    await ensureGuestSession(page);

    const runId = `rag-guest-search-${Date.now()}`;
    const company = await createGuestCompany(page, {
      name: `RAGゲスト検索_${runId}`,
      industry: "IT・通信",
      corporateUrl: "https://www.nttdata.com/",
    });

    try {
      const response = await apiRequest(
        page,
        "POST",
        `/api/companies/${company.id}/search-corporate-pages`,
        { contentType: "about" },
      );
      const status = response.status();
      const body = await response.text();
      // Completes without a server error
      expect(
        status < 500,
        `search-corporate-pages returned server error ${status}\n${body.slice(0, 400)}`,
      ).toBe(true);

      if (status === 200) {
        const json = JSON.parse(body) as { candidates: Array<{ confidence: string }> };
        expect(Array.isArray(json.candidates)).toBe(true);
        for (const candidate of json.candidates) {
          expect(
            ["high", "medium", "low"].includes(candidate.confidence),
            `candidate.confidence must be high/medium/low, got: ${String(candidate.confidence)}`,
          ).toBe(true);
        }
      }
    } finally {
      await deleteGuestCompany(page, company.id);
    }
  });
});

// ---------------------------------------------------------------------------
// Authenticated tests
// ---------------------------------------------------------------------------

test.describe("Corporate info RAG (authenticated)", () => {
  test.skip(!hasAuthenticatedUserAccess, "Requires CI_E2E_AUTH_SECRET or Google auth state");

  test("search-corporate-pages returns candidates with confidence field from FastAPI", async ({ page }) => {
    test.setTimeout(120_000);

    const runId = `rag-search-auth-${Date.now()}`;

    await signInAsAuthenticatedUser(page, "/dashboard");

    const company = await createOwnedCompany(page, {
      name: `NTTデータ_${runId}`,
      industry: "IT・通信",
      corporateUrl: "https://www.nttdata.com/",
    });

    try {
      const response = await apiRequestAsAuthenticatedUser(
        page,
        "POST",
        `/api/companies/${company.id}/search-corporate-pages`,
        { contentType: "about", cacheMode: "no_cache" },
      );
      await expectOkResponse(response, "search-corporate-pages (authenticated)");
      const json = (await response.json()) as {
        candidates: Array<{ confidence: string; url: string }>;
      };

      // FastAPI must have returned a candidates array (possibly empty for an
      // uncommon company name, but the shape is always present)
      expect(Array.isArray(json.candidates)).toBe(true);

      // Every candidate must carry confidence — set by FastAPI, not the fallback
      for (const candidate of json.candidates) {
        expect(
          ["high", "medium", "low"].includes(candidate.confidence),
          `candidate.confidence must be high/medium/low, got: ${String(candidate.confidence)}`,
        ).toBe(true);
        expect(typeof candidate.url).toBe("string");
      }
    } finally {
      await deleteOwnedCompany(page, company.id);
    }
  });

  test("new company has empty RAG state", async ({ page }) => {
    // A freshly created company must have no stored corporate info chunks.
    // The GET handler is at /api/companies/[id]/fetch-corporate.
    test.setTimeout(60_000);

    const runId = `rag-empty-${Date.now()}`;

    await signInAsAuthenticatedUser(page, "/dashboard");

    const company = await createOwnedCompany(page, {
      name: `RAG空テスト_${runId}`,
      industry: "その他",
    });

    try {
      const response = await apiRequestAsAuthenticatedUser(
        page,
        "GET",
        `/api/companies/${company.id}/fetch-corporate`,
      );

      // 200 with empty sources is the expected empty state.
      // 404 is also acceptable (no record created yet).
      const status = response.status();
      expect([200, 404]).toContain(status);

      if (status === 200) {
        const json = (await response.json()) as {
          corporateInfoUrls?: unknown[];
          ragStatus?: { totalChunks?: number; hasRag?: boolean };
        };
        // Fresh company: no ingested URLs, zero chunks
        const sources = json.corporateInfoUrls ?? [];
        const totalChunks = json.ragStatus?.totalChunks ?? 0;
        expect(Array.isArray(sources)).toBe(true);
        expect(sources.length).toBe(0);
        expect(totalChunks).toBe(0);
      }
    } finally {
      await deleteOwnedCompany(page, company.id);
    }
  });

  test("RAG ingest: crawl, embed, store complete without server error", async ({ page }) => {
    // Integration smoke test for the full ingest pipeline.
    // Result is non-deterministic (depends on the live page content).
    // We only verify the pipeline completes without a 5xx error and the
    // response envelope matches the expected shape.
    test.setTimeout(180_000);

    const runId = `rag-ingest-${Date.now()}`;

    await signInAsAuthenticatedUser(page, "/dashboard");

    const company = await createOwnedCompany(page, {
      name: `NTTデータ_${runId}`,
      industry: "IT・通信",
      corporateUrl: "https://www.nttdata.com/",
    });

    try {
      const response = await apiRequestAsAuthenticatedUser(
        page,
        "POST",
        `/api/companies/${company.id}/fetch-corporate`,
        {
          urls: ["https://www.nttdata.com/jp/ja/about-us/"],
          contentType: "about",
        },
      );
      const status = response.status();
      const body = await response.text();

      // Accept 200 or 402 (credit exhausted in CI); reject 5xx
      expect(
        status < 500,
        `fetch-corporate returned server error ${status}\n${body.slice(0, 600)}`,
      ).toBe(true);

      if (status === 200) {
        const json = JSON.parse(body) as {
          success?: boolean;
          chunksStored?: number;
          pagesCrawled?: number;
        };
        // Pipeline must report at least the shape (values may be zero if the page
        // returned no extractable content).
        // Field names mirror the Next.js route response: pagesCrawled, chunksStored.
        expect(typeof json.success).toBe("boolean");
        if (json.chunksStored !== undefined) {
          expect(typeof json.chunksStored).toBe("number");
        }
        if (json.pagesCrawled !== undefined) {
          expect(typeof json.pagesCrawled).toBe("number");
        }
      }
    } finally {
      await deleteOwnedCompany(page, company.id);
    }
  });
});
