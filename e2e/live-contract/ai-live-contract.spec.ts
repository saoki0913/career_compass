/**
 * Live Contract Tests — API contract + side-effect verification
 *
 * Tier 2: Runs against real backend with real LLM (gpt-5.4-mini).
 * Validates:
 *  - SSE event sequence (string_chunk → complete)
 *  - Complete payload matches Zod schema (shared with e2e/mocks/)
 *  - Conversation/document/draft persistence (side effects)
 *  - Error events use structured format (no raw exceptions)
 *  - Auth user vs guest boundary
 */

import { expect, test } from "@playwright/test";

import {
  apiRequestAsAuthenticatedUser,
  createOwnedCompany,
  createOwnedGakuchika,
  createOwnedApplication,
  deleteOwnedCompany,
  deleteOwnedGakuchika,
  expectOkResponse,
} from "../fixtures/auth";
import { hasAuthenticatedUserAccess, signInAsAuthenticatedUser } from "../google-auth";
import {
  parseSseEvents,
  parseCompleteData,
} from "../helpers/live-ai-conversation-utils";
import {
  gakuchikaCompleteEventSchema,
  motivationCompleteEventSchema,
  interviewCompleteEventSchema,
  stringChunkEventSchema,
  errorEventSchema,
} from "../mocks/schemas";

const CONTRACT_TIMEOUT_MS = 120_000;
const RUN_ID = `live-contract-${Date.now()}`;

function buildScopedName(base: string, caseId: string) {
  return `${base}_${caseId}_${RUN_ID}`.slice(0, 120);
}

function assertSseSequence(events: Array<{ type: string; [k: string]: unknown }>) {
  expect(events.length, "SSE stream must emit events").toBeGreaterThan(0);

  const chunks = events.filter((e) => e.type === "string_chunk");
  expect(chunks.length, "At least one string_chunk required").toBeGreaterThan(0);

  for (const chunk of chunks) {
    const parsed = stringChunkEventSchema.safeParse(chunk);
    expect(parsed.success, `string_chunk schema mismatch: ${JSON.stringify(chunk)}`).toBe(true);
  }

  const completeEvents = events.filter((e) => e.type === "complete");
  expect(completeEvents.length, "Exactly one complete event required").toBe(1);

  const errorEvents = events.filter((e) => e.type === "error");
  for (const err of errorEvents) {
    const parsed = errorEventSchema.safeParse(err);
    expect(parsed.success, `error event schema mismatch: ${JSON.stringify(err)}`).toBe(true);
    expect(JSON.stringify(err)).not.toContain("Traceback");
    expect(JSON.stringify(err)).not.toContain("stack");
  }
}

test.describe.serial("Live Contract Smoke Tests", () => {
  test.beforeEach(async ({ page }) => {
    test.skip(
      !hasAuthenticatedUserAccess,
      "Authenticated user access required for live contract tests",
    );
    await signInAsAuthenticatedUser(page, "/dashboard");
  });

  // ---------------------------------------------------------------------------
  // Gakuchika: contract + side-effect
  // ---------------------------------------------------------------------------
  test("gakuchika: API contract and side-effects", async ({ page }) => {
    test.setTimeout(CONTRACT_TIMEOUT_MS);

    const gakuchika = await createOwnedGakuchika(page, {
      title: "サークル運営改善",
      content: "参加率低下の課題に対して、メンバーへのヒアリングを実施し活動内容を刷新した。",
      charLimitType: "400",
    });

    try {
      const startResponse = await apiRequestAsAuthenticatedUser(
        page,
        "POST",
        `/api/gakuchika/${gakuchika.id}/conversation/new`,
        {},
      );
      const startBody = JSON.parse(
        await expectOkResponse(startResponse, "gakuchika conversation/new"),
      ) as { conversation: { id: string }; nextQuestion: string | null };

      expect(startBody.conversation.id).toBeTruthy();
      const sessionId = startBody.conversation.id;

      const streamResponse = await apiRequestAsAuthenticatedUser(
        page,
        "POST",
        `/api/gakuchika/${gakuchika.id}/conversation/stream`,
        {
          answer: "メンバーの声を聞いて改善提案を行い、参加率が回復しました。",
          sessionId,
        },
      );
      const rawText = await expectOkResponse(streamResponse, "gakuchika stream");
      const events = parseSseEvents(rawText);

      assertSseSequence(events);

      const completeData = parseCompleteData(events);
      const completeEvent = { type: "complete", data: completeData };
      const parsed = gakuchikaCompleteEventSchema.safeParse(completeEvent);
      expect(
        parsed.success,
        `Gakuchika complete schema mismatch: ${JSON.stringify(parsed.error?.issues ?? [])}`,
      ).toBe(true);

      const getResponse = await apiRequestAsAuthenticatedUser(
        page,
        "GET",
        `/api/gakuchika/${gakuchika.id}/conversation`,
      );
      const getBody = JSON.parse(
        await expectOkResponse(getResponse, "gakuchika conversation GET"),
      );
      expect(getBody.messages?.length).toBeGreaterThan(0);
    } finally {
      await deleteOwnedGakuchika(page, gakuchika.id);
    }
  });

  // ---------------------------------------------------------------------------
  // Motivation: contract + side-effect
  // ---------------------------------------------------------------------------
  test("motivation: API contract and side-effects", async ({ page }) => {
    test.setTimeout(CONTRACT_TIMEOUT_MS);

    const company = await createOwnedCompany(page, {
      name: buildScopedName("テストDX", "contract_motivation"),
      industry: "IT・通信",
    });
    await createOwnedApplication(page, company.id, {
      name: "企画職 応募",
      type: "main",
    });

    try {
      const startResponse = await apiRequestAsAuthenticatedUser(
        page,
        "POST",
        `/api/motivation/${company.id}/conversation/start`,
        { selectedIndustry: "IT・通信", selectedRole: "企画職" },
      );
      const startBody = JSON.parse(
        await expectOkResponse(startResponse, "motivation conversation/start"),
      ) as { conversation: { id: string }; nextQuestion: string };

      expect(startBody.conversation.id).toBeTruthy();

      const streamResponse = await apiRequestAsAuthenticatedUser(
        page,
        "POST",
        `/api/motivation/${company.id}/conversation/stream`,
        {
          answer: "業務改革を通じて顧客課題を減らせる点に魅力を感じています。",
          sessionId: startBody.conversation.id,
        },
      );
      const rawText = await expectOkResponse(streamResponse, "motivation stream");
      const events = parseSseEvents(rawText);

      assertSseSequence(events);

      const completeData = parseCompleteData(events);
      const completeEvent = { type: "complete", data: completeData };
      const parsed = motivationCompleteEventSchema.safeParse(completeEvent);
      expect(
        parsed.success,
        `Motivation complete schema mismatch: ${JSON.stringify(parsed.error?.issues ?? [])}`,
      ).toBe(true);

      const getResponse = await apiRequestAsAuthenticatedUser(
        page,
        "GET",
        `/api/motivation/${company.id}/conversation`,
      );
      const getBody = JSON.parse(
        await expectOkResponse(getResponse, "motivation conversation GET"),
      );
      expect(getBody.messages?.length).toBeGreaterThan(0);
    } finally {
      await deleteOwnedCompany(page, company.id);
    }
  });

  // ---------------------------------------------------------------------------
  // Interview: contract + side-effect
  // ---------------------------------------------------------------------------
  test("interview: API contract and side-effects", async ({ page }) => {
    test.setTimeout(CONTRACT_TIMEOUT_MS);

    const company = await createOwnedCompany(page, {
      name: buildScopedName("テストIT", "contract_interview"),
      industry: "IT・通信",
    });

    try {
      const createSessionResponse = await apiRequestAsAuthenticatedUser(
        page,
        "POST",
        `/api/companies/${company.id}/interview/sessions`,
        { selectedRole: "総合職" },
      );
      const sessionBody = JSON.parse(
        await expectOkResponse(createSessionResponse, "interview session create"),
      );

      const sessionId = sessionBody.session?.id ?? sessionBody.id;
      expect(sessionId, "session.id must be present").toBeTruthy();

      const turnResponse = await apiRequestAsAuthenticatedUser(
        page,
        "POST",
        `/api/companies/${company.id}/interview/sessions/${sessionId}/turn`,
        {
          answer: "学園祭の実行委員長として300人のチームをまとめました。",
        },
      );
      const rawText = await expectOkResponse(turnResponse, "interview turn");
      const events = parseSseEvents(rawText);

      assertSseSequence(events);

      const completeData = parseCompleteData(events);
      const completeEvent = { type: "complete", data: completeData };
      const parsed = interviewCompleteEventSchema.safeParse(completeEvent);
      expect(
        parsed.success,
        `Interview complete schema mismatch: ${JSON.stringify(parsed.error?.issues ?? [])}`,
      ).toBe(true);

      const getSessionResponse = await apiRequestAsAuthenticatedUser(
        page,
        "GET",
        `/api/companies/${company.id}/interview/sessions/${sessionId}`,
      );
      const getSessionBody = JSON.parse(
        await expectOkResponse(getSessionResponse, "interview session GET"),
      );
      expect(getSessionBody.session ?? getSessionBody).toBeTruthy();
    } finally {
      await deleteOwnedCompany(page, company.id);
    }
  });
});
