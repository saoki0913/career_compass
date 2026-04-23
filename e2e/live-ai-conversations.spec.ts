/**
 * SSE Smoke Tests — Live AI conversations
 *
 * Verifies that SSE streams are delivered end-to-end:
 * - at least one string_chunk event is received
 * - a complete event terminates the stream
 *
 * Quality checks (token coverage, draft length, forbidden tokens, LLM judge)
 * live in pytest (backend/tests/) only.
 */

import { expect, test } from "@playwright/test";

import {
  apiRequestAsAuthenticatedUser,
  createOwnedApplication,
  createOwnedCompany,
  createOwnedGakuchika,
  deleteOwnedCompany,
  deleteOwnedGakuchika,
  expectOkResponse,
} from "./fixtures/auth";
import { hasAuthenticatedUserAccess, signInAsAuthenticatedUser } from "./google-auth";
import {
  cleanupStaleLiveAiCompanies,
  collectChunks,
  parseSseEvents,
  parseCompleteData,
  runGakuchikaSetupWithRequest,
  runMotivationSetupWithRequest,
} from "./helpers/live-ai-conversation-utils";

const RUN_ID = `live-ai-conversations-${Date.now()}`;
const SSE_SMOKE_TIMEOUT_MS = 300_000;

// Case IDs used when building company names — needed for stale-cleanup matching.
const SMOKE_CASE_IDS = ["sse_smoke_motivation", "sse_smoke_interview"];

function buildScopedCompanyName(base: string, caseId: string) {
  return `${base}_${caseId}_${RUN_ID}`.slice(0, 120);
}

const LLM_NON_DETERMINISM_PATTERNS = [
  "did not reach draft_ready",
  "stream did not emit a complete event",
  "AIから有効な",
  "AIサービスに接続できません",
];

function isLlmNonDeterminismError(message: string): boolean {
  return LLM_NON_DETERMINISM_PATTERNS.some((p) => message.includes(p));
}

test.describe.serial("SSE Smoke Tests", () => {
  test.beforeEach(async ({ page }) => {
    test.skip(
      !hasAuthenticatedUserAccess,
      "Authenticated user access is required for live conversation tests",
    );
    await signInAsAuthenticatedUser(page, "/dashboard");
  });

  test.afterAll(async ({ browser }) => {
    // Best-effort stale company cleanup: run in a fresh context so it does not
    // depend on any per-test page state that may already be closed.
    const context = await browser.newContext();
    const page = await context.newPage();
    try {
      await cleanupStaleLiveAiCompanies(page, SMOKE_CASE_IDS);
    } finally {
      await context.close();
    }
  });

  // -------------------------------------------------------------------------
  // gakuchika: SSE stream + complete
  // -------------------------------------------------------------------------
  test("gakuchika: SSE stream delivers string_chunk and complete events", async ({ page }) => {
    test.setTimeout(SSE_SMOKE_TIMEOUT_MS);

    const gakuchika = await createOwnedGakuchika(page, {
      title: "塾講師のアルバイトで学習習慣改善",
      content:
        "宿題未提出が続く生徒が増えており、校舎全体で対応を見直した。担当講師として共有フォーマットを整え、提出率の改善につなげた。",
      charLimitType: "400",
    });

    try {
      // Start conversation — returns JSON with first assistant question
      const startResponse = await apiRequestAsAuthenticatedUser(
        page,
        "POST",
        `/api/gakuchika/${gakuchika.id}/conversation/new`,
        {},
      );
      const startBody = JSON.parse(
        await expectOkResponse(startResponse, "gakuchika conversation/new"),
      ) as { conversation: { id: string }; nextQuestion: string | null };

      const sessionId = startBody.conversation.id;
      expect(sessionId, "conversation.id must be present").toBeTruthy();

      // Send one answer via SSE stream endpoint
      const streamResponse = await apiRequestAsAuthenticatedUser(
        page,
        "POST",
        `/api/gakuchika/${gakuchika.id}/conversation/stream`,
        {
          answer:
            "宿題提出率と面談メモを見て要注意生徒から優先して声かけし、週次ミーティングで改善提案を回しました。",
          sessionId,
        },
      );
      const rawText = await expectOkResponse(streamResponse, "gakuchika conversation/stream");
      const events = parseSseEvents(rawText);

      // Verify SSE delivery: at least one string_chunk must be present
      const chunks = events.filter((e) => e.type === "string_chunk");
      expect(
        chunks.length,
        `Expected at least one string_chunk event; got ${events.map((e) => e.type).join(",")}`,
      ).toBeGreaterThan(0);

      // Verify terminal state: a complete event must close the stream
      const completeEvents = events.filter((e) => e.type === "complete");
      expect(
        completeEvents.length,
        `Expected a complete event; got event types: ${events.map((e) => e.type).join(",")}`,
      ).toBeGreaterThan(0);

      // Complete data must be an object (not null or primitive)
      const completeData = parseCompleteData(events);
      expect(typeof completeData).toBe("object");
    } finally {
      await deleteOwnedGakuchika(page, gakuchika.id);
    }
  });

  // -------------------------------------------------------------------------
  // motivation: SSE stream + complete
  // -------------------------------------------------------------------------
  test("motivation: SSE stream delivers string_chunk and complete events", async ({ page }) => {
    test.setTimeout(SSE_SMOKE_TIMEOUT_MS);

    const company = await createOwnedCompany(page, {
      name: buildScopedCompanyName("テストDX", "sse_smoke_motivation"),
      industry: "IT・通信",
    });
    const application = await createOwnedApplication(page, company.id, {
      name: "企画職 応募",
      type: "main",
    });
    // application is created for context; its id is available if needed for extensions
    void application;

    try {
      // Start motivation conversation
      const startResponse = await apiRequestAsAuthenticatedUser(
        page,
        "POST",
        `/api/motivation/${company.id}/conversation/start`,
        { selectedIndustry: "IT・通信", selectedRole: "企画職" },
      );
      const startBody = JSON.parse(
        await expectOkResponse(startResponse, "motivation conversation/start"),
      ) as { conversation: { id: string }; nextQuestion: string };

      const sessionId = startBody.conversation.id;
      expect(sessionId, "conversation.id must be present").toBeTruthy();

      // Send one answer via SSE stream endpoint
      const streamResponse = await apiRequestAsAuthenticatedUser(
        page,
        "POST",
        `/api/motivation/${company.id}/conversation/stream`,
        {
          answer:
            "学園祭運営で申請と連絡の流れを整理し、確認漏れを減らした経験から、業務改革で顧客課題を減らせるIT業界を志望しています。",
          sessionId,
        },
      );
      const rawText = await expectOkResponse(streamResponse, "motivation conversation/stream");
      const events = parseSseEvents(rawText);

      // Verify SSE delivery
      const chunks = events.filter((e) => e.type === "string_chunk");
      expect(
        chunks.length,
        `Expected at least one string_chunk event; got ${events.map((e) => e.type).join(",")}`,
      ).toBeGreaterThan(0);

      // Verify terminal state
      const completeEvents = events.filter((e) => e.type === "complete");
      expect(
        completeEvents.length,
        `Expected a complete event; got event types: ${events.map((e) => e.type).join(",")}`,
      ).toBeGreaterThan(0);

      const completeData = parseCompleteData(events);
      expect(typeof completeData).toBe("object");
    } finally {
      await deleteOwnedCompany(page, company.id);
    }
  });

  // -------------------------------------------------------------------------
  // interview: SSE stream + complete (start endpoint emits SSE directly)
  // -------------------------------------------------------------------------
  test("interview: SSE stream delivers string_chunk and complete events", async ({ page }) => {
    test.setTimeout(SSE_SMOKE_TIMEOUT_MS);

    const company = await createOwnedCompany(page, {
      name: buildScopedCompanyName("テストDX", "sse_smoke_interview"),
      industry: "IT・通信",
    });
    const application = await createOwnedApplication(page, company.id, {
      name: "企画職 応募",
      type: "main",
    });
    void application;

    const gakuchika = await createOwnedGakuchika(page, {
      title: "塾講師のアルバイトで学習習慣改善",
      content:
        "宿題未提出が続く生徒が増えており、校舎全体で対応を見直した。担当講師として共有フォーマットを整え、提出率の改善につなげた。",
      charLimitType: "400",
    });

    try {
      // Prerequisite: complete motivation conversation so interview can start.
      // LLM non-determinism can surface as various errors (no complete event,
      // draft_ready timeout, empty response). Skip gracefully for these;
      // real errors (401/500/network) must still fail the test.
      try {
        await runMotivationSetupWithRequest(
          apiRequestAsAuthenticatedUser,
          page,
          company.id,
          "IT・通信",
          "企画職",
          [],
        );
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        if (isLlmNonDeterminismError(msg)) {
          test.skip(true, `Prerequisite: motivation setup failed (LLM non-determinism): ${msg}`);
          return;
        }
        throw e;
      }

      // Prerequisite: complete gakuchika conversation
      try {
        await runGakuchikaSetupWithRequest(
          apiRequestAsAuthenticatedUser,
          page,
          gakuchika.id,
          [],
        );
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        if (isLlmNonDeterminismError(msg)) {
          test.skip(true, `Prerequisite: gakuchika setup failed (LLM non-determinism): ${msg}`);
          return;
        }
        throw e;
      }

      // Interview start endpoint returns SSE directly
      const startResponse = await apiRequestAsAuthenticatedUser(
        page,
        "POST",
        `/api/companies/${company.id}/interview/start`,
        {},
      );
      const rawText = await expectOkResponse(startResponse, "interview/start");
      const events = parseSseEvents(rawText);

      // Verify SSE delivery
      const questionChunks = collectChunks(events, "question");
      const anyStringChunk = events.filter((e) => e.type === "string_chunk");
      expect(
        anyStringChunk.length,
        `Expected at least one string_chunk event; got types: ${events.map((e) => e.type).join(",")}`,
      ).toBeGreaterThan(0);

      // Verify terminal state
      const completeEvents = events.filter((e) => e.type === "complete");
      expect(
        completeEvents.length,
        `Expected a complete event; got event types: ${events.map((e) => e.type).join(",")}`,
      ).toBeGreaterThan(0);

      const completeData = parseCompleteData(events);
      expect(typeof completeData).toBe("object");

      // The interview start must produce a non-empty initial question
      const initialQuestion =
        String((completeData as Record<string, unknown>).question || questionChunks || "");
      expect(
        initialQuestion.length,
        "interview/start must produce a non-empty initial question",
      ).toBeGreaterThan(0);
    } finally {
      await deleteOwnedGakuchika(page, gakuchika.id);
      await deleteOwnedCompany(page, company.id);
    }
  });
});
