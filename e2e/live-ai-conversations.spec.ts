import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  apiRequest,
  apiRequestAsAuthenticatedUser,
  createOwnedApplication,
  createOwnedCompany,
  createOwnedDocument,
  createOwnedGakuchika,
  deleteOwnedCompany,
  deleteOwnedDocument,
  deleteOwnedGakuchika,
  expectOkResponse,
} from "./fixtures/auth";
import { hasAuthenticatedUserAccess, signInAsAuthenticatedUser } from "./google-auth";
import {
  generateLiveAiConversationReport,
  writeLiveAiConversationReport,
  type LiveAiConversationCheck,
  type LiveAiConversationFeature,
  type LiveAiConversationJudge,
  type LiveAiConversationReportRow,
  type LiveAiConversationSuiteDepth,
  type LiveAiConversationTargetEnv,
  type LiveAiConversationTranscriptTurn,
} from "../src/lib/testing/live-ai-conversation-report";

type GakuchikaCase = {
  id: string;
  suiteDepth: LiveAiConversationSuiteDepth;
  title: string;
  gakuchikaTitle: string;
  gakuchikaContent: string;
  charLimitType: "300" | "400" | "500";
  answers: string[];
  expectedQuestionTokens: string[];
  expectedSummaryTokens: string[];
};

type MotivationCase = {
  id: string;
  suiteDepth: LiveAiConversationSuiteDepth;
  title: string;
  companyName: string;
  industry: string;
  selectedIndustry: string;
  selectedRole: string;
  applicationJobType: string;
  answers: string[];
  expectedQuestionTokens: string[];
  expectedDraftTokens: string[];
};

type InterviewCase = {
  id: string;
  suiteDepth: LiveAiConversationSuiteDepth;
  title: string;
  companyName: string;
  industry: string;
  selectedIndustry: string;
  selectedRole: string;
  applicationJobType: string;
  motivation: {
    answers: string[];
  };
  gakuchika: {
    title: string;
    content: string;
    charLimitType: "300" | "400" | "500";
    answers: string[];
  };
  interview: {
    answers: string[];
    expectedQuestionTokens: string[];
    expectedFeedbackTokens: string[];
  };
};

type ParsedSseEvent = { type: string; [key: string]: unknown };
type ChatMessage = { role: "assistant" | "user"; content: string };
type SetupResponseLike = {
  ok(): boolean;
  status(): number;
  statusText(): string;
  text(): Promise<string>;
};

type SetupRequester = typeof apiRequest;

const CASE_SET = (
  process.env.LIVE_AI_CONVERSATION_CASE_SET?.trim() ||
  process.env.AI_LIVE_SUITE?.trim() ||
  "smoke"
) as LiveAiConversationSuiteDepth;
const TARGET_ENV = (
  process.env.LIVE_AI_CONVERSATION_TARGET_ENV?.trim() || "staging"
) as LiveAiConversationTargetEnv;
const FEATURE_FILTER = process.env.LIVE_AI_CONVERSATION_FEATURE?.trim() as
  | LiveAiConversationFeature
  | undefined;
const OUTPUT_DIR = path.resolve(
  process.cwd(),
  process.env.AI_LIVE_OUTPUT_DIR?.trim() || "backend/tests/output",
);
const RUN_ID = `live-ai-conversations-${Date.now()}`;
const LIVE_CONVERSATION_TEST_TIMEOUT_MS = 180_000;

function buildScopedCompanyName(companyName: string, caseId: string) {
  return `${companyName}_${caseId}_${RUN_ID}`.slice(0, 120);
}

function readJsonCases<T>(relativePath: string): T[] {
  const absolutePath = path.resolve(process.cwd(), relativePath);
  const raw = JSON.parse(readFileSync(absolutePath, "utf8"));
  if (!Array.isArray(raw)) {
    throw new Error(`Expected array in ${relativePath}`);
  }
  return raw as T[];
}

function selectCases<T extends { suiteDepth: LiveAiConversationSuiteDepth }>(cases: T[]): T[] {
  if (CASE_SET === "extended") {
    return cases;
  }
  return cases.filter((item) => item.suiteDepth === "smoke");
}

function parseSseEvents(rawText: string): ParsedSseEvent[] {
  return rawText
    .replace(/\r\n/g, "\n")
    .split("\n\n")
    .map((block) => block.trim())
    .filter(Boolean)
    .flatMap((block) => {
      const dataLine = block.split("\n").find((line) => line.startsWith("data: "));
      if (!dataLine) return [];

      try {
        return [JSON.parse(dataLine.slice("data: ".length).trim()) as ParsedSseEvent];
      } catch {
        return [];
      }
    });
}

function parseCompleteData(events: ParsedSseEvent[]) {
  const completeEvent = events.find((event) => event.type === "complete");
  if (!completeEvent) {
    throw new Error("stream did not emit a complete event");
  }
  return (completeEvent.data || {}) as Record<string, unknown>;
}

function collectChunks(events: ParsedSseEvent[], pathName: string): string {
  return events
    .filter((event) => event.type === "string_chunk" && event.path === pathName)
    .map((event) => String(event.text || ""))
    .join("");
}

function toUtcStamp(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, "Z").replace(/[-:]/g, "");
}

function shouldRunFeature(feature: LiveAiConversationFeature) {
  return !FEATURE_FILTER || FEATURE_FILTER === feature;
}

function selectedFeatures(): LiveAiConversationFeature[] {
  return (["gakuchika", "motivation", "interview"] as const).filter((feature) => shouldRunFeature(feature));
}

function pushAssistantIfPresent(transcript: LiveAiConversationTranscriptTurn[], content: string) {
  if (content.trim()) {
    transcript.push({ role: "assistant", content });
  }
}

function countTokenHits(texts: string[], tokens: string[]) {
  return tokens.filter((token) => texts.some((text) => text.includes(token))).length;
}

function buildChecks(checks: Array<{ name: string; passed: boolean; evidence: string[] }>) {
  return checks.map((check) => ({
    name: check.name,
    passed: check.passed,
    evidence: check.evidence,
  })) satisfies LiveAiConversationCheck[];
}

async function readSetupResponseBody(response: SetupResponseLike, label: string) {
  const body = await response.text().catch(() => "");
  if (!response.ok()) {
    throw new Error(`${label} failed with ${response.status()} ${response.statusText()}\n${body.slice(0, 1200)}`);
  }
  return body;
}

function buildJudge(
  feature: LiveAiConversationFeature,
  transcript: LiveAiConversationTranscriptTurn[],
  finalText: string,
  questionTokens: string[],
  outputTokens: string[],
): LiveAiConversationJudge {
  const transcriptTexts = transcript.map((turn) => turn.content);
  const questionHitCount = countTokenHits(transcriptTexts, questionTokens);
  const outputHitCount = countTokenHits([finalText], outputTokens);
  const questionThreshold = Math.max(1, Math.min(questionTokens.length, 2));
  const outputThreshold = Math.max(1, Math.min(outputTokens.length, 2));
  const warnings: string[] = [];
  const reasons: string[] = [];

  if (questionHitCount < questionThreshold) {
    warnings.push("会話の深掘りが弱い");
    reasons.push(`${feature}:question-depth`);
  }
  if (outputHitCount < outputThreshold) {
    warnings.push("最終生成物の要点反映が弱い");
    reasons.push(`${feature}:output-grounding`);
  }

  return {
    enabled: process.env.LIVE_AI_CONVERSATION_ENABLE_JUDGE !== "0",
    model: "heuristic-live-judge-v1",
    overallPass: reasons.length === 0,
    blocking: false,
    scores: {
      questionDepth: questionHitCount,
      outputGrounding: outputHitCount,
    },
    warnings,
    reasons,
  };
}

function buildMissingFeatureRow(feature: LiveAiConversationFeature): LiveAiConversationReportRow {
  return {
    feature,
    caseId: "__missing_report__",
    title: `${feature} live suite failed before report rows were recorded`,
    status: "failed",
    severity: "failed",
    durationMs: 0,
    transcript: [],
    outputs: { finalText: "", generatedDocumentId: null },
    deterministicFailReasons: ["missing_report", "suite_failed_before_report_rows"],
    checks: [
      {
        name: "report-generated",
        passed: false,
        evidence: ["no rows were captured before afterAll"],
      },
    ],
    judge: null,
    cleanup: { ok: true, removedIds: [] },
  };
}

async function createOwnedJobType(
  page: Parameters<typeof apiRequest>[0],
  applicationId: string,
  name: string,
) {
  const response = await apiRequestAsAuthenticatedUser(page, "POST", `/api/applications/${applicationId}/job-types`, {
    name,
  });
  const body = JSON.parse(
    await expectOkResponse(response, `create job type ${name}`),
  ) as { jobType: { id: string; name: string } };
  return body.jobType;
}

async function startMotivationSetupWithRequest(
  request: SetupRequester,
  page: Parameters<typeof apiRequest>[0],
  companyId: string,
  selectedIndustry: string,
  selectedRole: string,
  transcript?: LiveAiConversationTranscriptTurn[],
) {
  let startResponse = await request(page, "POST", `/api/motivation/${companyId}/conversation/start`, {
    selectedIndustry,
    selectedRole,
  });

  if (startResponse.status() === 409) {
    const resetResponse = await request(page, "DELETE", `/api/motivation/${companyId}/conversation`);
    await readSetupResponseBody(resetResponse, `motivation setup reset ${companyId}`);
    startResponse = await request(page, "POST", `/api/motivation/${companyId}/conversation/start`, {
      selectedIndustry,
      selectedRole,
    });
  }

  const startBody = JSON.parse(
    await readSetupResponseBody(startResponse, `motivation setup start ${companyId}`),
  ) as {
    conversation: { id: string };
    nextQuestion: string;
    messages: ChatMessage[];
  };

  const sessionId = startBody.conversation.id;
  const nextQuestionText = startBody.nextQuestion || startBody.messages[0]?.content || "";
  pushAssistantIfPresent(transcript ?? [], nextQuestionText);

  return {
    sessionId,
    nextQuestionText,
  };
}

export async function runMotivationSetupWithRequest(
  request: SetupRequester,
  page: Parameters<typeof apiRequest>[0],
  companyId: string,
  selectedIndustry: string,
  selectedRole: string,
  answers: string[],
  transcript?: LiveAiConversationTranscriptTurn[],
) {
  const { sessionId, nextQuestionText: firstQuestion } = await startMotivationSetupWithRequest(
    request,
    page,
    companyId,
    selectedIndustry,
    selectedRole,
    transcript,
  );
  let nextQuestionText = firstQuestion;

  let latestComplete: Record<string, unknown> | null = null;
  const totalAttempts = Math.max(answers.length + MOTIVATION_FALLBACK_ANSWERS.length, 6);

  for (let attempt = 0; attempt < totalAttempts; attempt += 1) {
    const answer =
      attempt < answers.length
        ? answers[attempt]
        : buildDeterministicMotivationFollowupAnswer({
            nextQuestion: nextQuestionText,
            attemptIndex: attempt - answers.length,
            transcript,
          });
    transcript?.push({ role: "user", content: answer });
    const streamResponse = await request(page, "POST", `/api/motivation/${companyId}/conversation/stream`, {
      answer,
      sessionId,
    });
    const events = parseSseEvents(await readSetupResponseBody(streamResponse, `motivation setup stream ${companyId}`));
    const nextQuestion = collectChunks(events, "question");
    latestComplete = parseCompleteData(events);
    nextQuestionText = String(latestComplete?.nextQuestion || nextQuestion || "");
    pushAssistantIfPresent(transcript ?? [], nextQuestionText);
    if (latestComplete?.isDraftReady === true) {
      return latestComplete;
    }
  }

  throw new Error("motivation conversation did not reach draft_ready");
}

async function runMotivationSetup(
  page: Parameters<typeof apiRequest>[0],
  companyId: string,
  selectedIndustry: string,
  selectedRole: string,
  answers: string[],
  transcript?: LiveAiConversationTranscriptTurn[],
) {
  return runMotivationSetupWithRequest(
    apiRequestAsAuthenticatedUser,
    page,
    companyId,
    selectedIndustry,
    selectedRole,
    answers,
    transcript,
  );
}

const MOTIVATION_FALLBACK_ANSWERS = [
  "原体験として、課題を整理して関係者を巻き込みながら前に進めた経験があります。",
  "その経験から、事業と現場の両方を理解し、価値につなげる仕事に魅力を感じています。",
  "入社後は、顧客課題を構造化して周囲と連携しながら改善を進めたいです。",
  "他社ではなくこの会社を選ぶ理由として、事業の広がりと挑戦機会の大きさを重視しています。",
];

function buildDeterministicMotivationFollowupAnswer(input: {
  nextQuestion: string;
  attemptIndex: number;
  transcript?: LiveAiConversationTranscriptTurn[];
}) {
  const fallback =
    MOTIVATION_FALLBACK_ANSWERS[
      Math.min(input.attemptIndex, MOTIVATION_FALLBACK_ANSWERS.length - 1)
    ];
  const latestUserAnswer =
    [...(input.transcript ?? [])]
      .reverse()
      .find((turn) => turn.role === "user" && turn.content.trim())
      ?.content.trim() || "";
  const question = input.nextQuestion.trim();
  const prefix = latestUserAnswer ? `直前の回答「${latestUserAnswer}」を補足すると、` : "";
  return question ? `${prefix}${fallback} 追加で「${question}」にも答える形で整理します。` : `${prefix}${fallback}`;
}

const GAKUCHIKA_FALLBACK_ANSWERS = [
  "補足すると、役割分担を明確にしながら、周囲が動きやすい状態を整えました。",
  "さらに、改善提案を小さく回して、関係者と認識をそろえました。",
  "最後に、数字と現場の声の両方を見ながら、運用を微調整しました。",
  "加えて、継続して見直せるように、共有の型も整えました。",
];

export function buildDeterministicGakuchikaFollowupAnswer(input: {
  nextQuestion: string;
  attemptIndex: number;
  transcript?: LiveAiConversationTranscriptTurn[];
}) {
  const fallback =
    GAKUCHIKA_FALLBACK_ANSWERS[
      Math.min(input.attemptIndex, GAKUCHIKA_FALLBACK_ANSWERS.length - 1)
    ];
  const latestUserAnswer =
    [...(input.transcript ?? [])]
      .reverse()
      .find((turn) => turn.role === "user" && turn.content.trim())
      ?.content.trim() || "";
  const trimmedQuestion = input.nextQuestion.trim();
  const contextPrefix = latestUserAnswer ? `直前の回答「${latestUserAnswer}」を踏まえると、` : "";
  return trimmedQuestion
    ? `${contextPrefix}${fallback} 追加確認としては「${trimmedQuestion}」に答える形で補足します。`
    : `${contextPrefix}${fallback}`;
}

export async function runGakuchikaSetupWithRequest(
  request: SetupRequester,
  page: Parameters<typeof apiRequest>[0],
  gakuchikaId: string,
  answers: string[],
  transcript?: LiveAiConversationTranscriptTurn[],
) {
  const startResponse = await request(page, "POST", `/api/gakuchika/${gakuchikaId}/conversation/new`, {});
  const startBody = JSON.parse(
    await readSetupResponseBody(startResponse, `gakuchika setup start ${gakuchikaId}`),
  ) as {
    conversation: { id: string };
    messages: ChatMessage[];
    nextQuestion: string | null;
  };

  const sessionId = startBody.conversation.id;
  pushAssistantIfPresent(
    transcript ?? [],
    startBody.messages[0]?.content || startBody.nextQuestion || "",
  );

  let latestComplete: Record<string, unknown> | null = null;
  let nextQuestionText = startBody.nextQuestion || startBody.messages[0]?.content || "";
  const totalAttempts = Math.max(answers.length + GAKUCHIKA_FALLBACK_ANSWERS.length, 6);
  for (let attempt = 0; attempt < totalAttempts; attempt += 1) {
    const answer =
      attempt < answers.length
        ? answers[attempt]
        : buildDeterministicGakuchikaFollowupAnswer({
            nextQuestion: nextQuestionText,
            attemptIndex: attempt - answers.length,
            transcript,
          });
    transcript?.push({ role: "user", content: answer });
    const streamResponse = await request(page, "POST", `/api/gakuchika/${gakuchikaId}/conversation/stream`, {
      answer,
      sessionId,
    });
    const events = parseSseEvents(await readSetupResponseBody(streamResponse, `gakuchika setup stream ${gakuchikaId}`));
    const nextQuestion = collectChunks(events, "question");
    latestComplete = parseCompleteData(events);
    nextQuestionText = String(latestComplete?.nextQuestion || nextQuestion || "");
    pushAssistantIfPresent(transcript ?? [], nextQuestionText);
    if (latestComplete?.isCompleted === true) {
      return latestComplete;
    }
  }

  throw new Error("gakuchika conversation did not complete");
}

async function runGakuchikaSetup(
  page: Parameters<typeof apiRequest>[0],
  gakuchikaId: string,
  answers: string[],
  transcript?: LiveAiConversationTranscriptTurn[],
) {
  return runGakuchikaSetupWithRequest(apiRequestAsAuthenticatedUser, page, gakuchikaId, answers, transcript);
}

async function runGakuchikaCase(
  page: Parameters<typeof apiRequest>[0],
  input: GakuchikaCase,
): Promise<LiveAiConversationReportRow> {
  const created = await createOwnedGakuchika(page, {
    title: input.gakuchikaTitle,
    content: input.gakuchikaContent,
    charLimitType: input.charLimitType,
  });

  const transcript: LiveAiConversationTranscriptTurn[] = [];
  const removedIds: string[] = [];
  const deterministicFailReasons: string[] = [];
  const startedAt = Date.now();
  let finalText = "";
  let generatedDocumentId: string | null = null;
  let cleanupOk = true;
  let status: LiveAiConversationReportRow["status"] = "passed";
  let checks: LiveAiConversationCheck[] = [];
  let judge: LiveAiConversationJudge | null = null;

  try {
    const latestComplete = await runGakuchikaSetup(page, created.id, input.answers, transcript);

    const draftResponse = await apiRequestAsAuthenticatedUser(page, "POST", `/api/gakuchika/${created.id}/generate-es-draft`, {
      charLimit: Number(input.charLimitType),
    });
    const draft = JSON.parse(
      await expectOkResponse(draftResponse, `gakuchika draft ${input.id}`),
    ) as {
      draft: string;
      documentId: string;
    };

    generatedDocumentId = draft.documentId;
    finalText = draft.draft;

    const transcriptTexts = transcript.map((turn) => turn.content);
    const questionHit = countTokenHits(transcriptTexts, input.expectedQuestionTokens);
    const summaryHit = countTokenHits([finalText], input.expectedSummaryTokens);
    checks = buildChecks([
      {
        name: "conversation-complete",
        passed: latestComplete?.isCompleted === true,
        evidence: [`isCompleted=${String(latestComplete?.isCompleted)}`],
      },
      {
        name: "question-token-coverage",
        passed: questionHit >= 1,
        evidence: [`hits=${questionHit}/${input.expectedQuestionTokens.length}`],
      },
      {
        name: "summary-token-coverage",
        passed: summaryHit >= 1,
        evidence: [`hits=${summaryHit}/${input.expectedSummaryTokens.length}`],
      },
      {
        name: "draft-generated",
        passed: Boolean(generatedDocumentId),
        evidence: [generatedDocumentId ? `documentId=${generatedDocumentId}` : "documentId=none"],
      },
    ]);
    for (const check of checks) {
      expect(check.passed, `${input.id}:${check.name}`).toBeTruthy();
    }
    judge = buildJudge(
      "gakuchika",
      transcript,
      finalText,
      input.expectedQuestionTokens,
      input.expectedSummaryTokens,
    );
  } catch (error) {
    status = "failed";
    deterministicFailReasons.push(error instanceof Error ? error.message : "unknown_error");
  } finally {
    try {
      if (generatedDocumentId) {
        await deleteOwnedDocument(page, generatedDocumentId);
        removedIds.push(generatedDocumentId);
      }
    } catch {
      cleanupOk = false;
    }

    try {
      await deleteOwnedGakuchika(page, created.id);
      removedIds.push(created.id);
    } catch {
      cleanupOk = false;
    }
  }

  const cleanupCheck = {
    name: "cleanup",
    passed: cleanupOk,
    evidence: cleanupOk ? removedIds : ["cleanup failed"],
  };
  checks = [...checks, cleanupCheck];
  if (!cleanupOk) {
    status = "failed";
    deterministicFailReasons.push("cleanup_failed");
  }
  const severity: LiveAiConversationReportRow["severity"] =
    status === "failed" ? "failed" : judge && !judge.overallPass ? "degraded" : "passed";

  return {
    feature: "gakuchika",
    caseId: input.id,
    title: input.title,
    status,
    severity,
    durationMs: Date.now() - startedAt,
    transcript,
    outputs: { finalText, generatedDocumentId },
    deterministicFailReasons,
    checks,
    judge,
    cleanup: { ok: cleanupOk, removedIds },
  };
}

async function runMotivationCase(
  page: Parameters<typeof apiRequest>[0],
  input: MotivationCase,
): Promise<LiveAiConversationReportRow> {
  const company = await createOwnedCompany(page, {
    name: buildScopedCompanyName(input.companyName, input.id),
    industry: input.industry,
  });
  const application = await createOwnedApplication(page, company.id, {
    name: `${input.selectedRole} 応募`,
    type: "main",
  });
  await createOwnedJobType(page, application.id, input.applicationJobType);

  const transcript: LiveAiConversationTranscriptTurn[] = [];
  const removedIds: string[] = [];
  const deterministicFailReasons: string[] = [];
  const startedAt = Date.now();
  let finalText = "";
  let generatedDocumentId: string | null = null;
  let cleanupOk = true;
  let status: LiveAiConversationReportRow["status"] = "passed";
  let checks: LiveAiConversationCheck[] = [];
  let judge: LiveAiConversationJudge | null = null;

  try {
    const latestComplete = await runMotivationSetup(
      page,
      company.id,
      input.selectedIndustry,
      input.selectedRole,
      input.answers,
      transcript,
    );

    if (latestComplete?.isDraftReady !== true) {
      throw new Error("motivation draft was not ready");
    }

    const draftResponse = await apiRequestAsAuthenticatedUser(page, "POST", `/api/motivation/${company.id}/generate-draft`, {
      charLimit: 400,
    });
    const draft = JSON.parse(
      await expectOkResponse(draftResponse, `motivation draft ${input.id}`),
    ) as {
      draft: string;
      documentId: string;
    };

    generatedDocumentId = draft.documentId;
    finalText = draft.draft;
    const transcriptTexts = transcript.map((turn) => turn.content);
    const questionHit = countTokenHits(transcriptTexts, input.expectedQuestionTokens);
    const draftHit = countTokenHits([finalText], input.expectedDraftTokens);
    checks = buildChecks([
      {
        name: "draft-ready",
        passed: latestComplete?.isDraftReady === true,
        evidence: [`isDraftReady=${String(latestComplete?.isDraftReady)}`],
      },
      {
        name: "question-token-coverage",
        passed: questionHit >= 1,
        evidence: [`hits=${questionHit}/${input.expectedQuestionTokens.length}`],
      },
      {
        name: "draft-token-coverage",
        passed: draftHit >= 1,
        evidence: [`hits=${draftHit}/${input.expectedDraftTokens.length}`],
      },
      {
        name: "draft-generated",
        passed: Boolean(generatedDocumentId),
        evidence: [generatedDocumentId ? `documentId=${generatedDocumentId}` : "documentId=none"],
      },
    ]);
    for (const check of checks) {
      expect(check.passed, `${input.id}:${check.name}`).toBeTruthy();
    }
    judge = buildJudge(
      "motivation",
      transcript,
      finalText,
      input.expectedQuestionTokens,
      input.expectedDraftTokens,
    );
  } catch (error) {
    status = "failed";
    deterministicFailReasons.push(error instanceof Error ? error.message : "unknown_error");
  } finally {
    try {
      if (generatedDocumentId) {
        await deleteOwnedDocument(page, generatedDocumentId);
        removedIds.push(generatedDocumentId);
      }
    } catch {
      cleanupOk = false;
    }

    try {
      await deleteOwnedCompany(page, company.id);
      removedIds.push(company.id);
    } catch {
      cleanupOk = false;
    }
  }

  const cleanupCheck = {
    name: "cleanup",
    passed: cleanupOk,
    evidence: cleanupOk ? removedIds : ["cleanup failed"],
  };
  checks = [...checks, cleanupCheck];
  if (!cleanupOk) {
    status = "failed";
    deterministicFailReasons.push("cleanup_failed");
  }
  const severity: LiveAiConversationReportRow["severity"] =
    status === "failed" ? "failed" : judge && !judge.overallPass ? "degraded" : "passed";

  return {
    feature: "motivation",
    caseId: input.id,
    title: input.title,
    status,
    severity,
    durationMs: Date.now() - startedAt,
    transcript,
    outputs: { finalText, generatedDocumentId },
    deterministicFailReasons,
    checks,
    judge,
    cleanup: { ok: cleanupOk, removedIds },
  };
}

async function runInterviewCase(
  page: Parameters<typeof apiRequest>[0],
  input: InterviewCase,
): Promise<LiveAiConversationReportRow> {
  const company = await createOwnedCompany(page, {
    name: buildScopedCompanyName(input.companyName, input.id),
    industry: input.industry,
  });
  const application = await createOwnedApplication(page, company.id, {
    name: `${input.selectedRole} 応募`,
    type: "main",
  });
  await createOwnedJobType(page, application.id, input.applicationJobType);

  const transcript: LiveAiConversationTranscriptTurn[] = [];
  const removedIds: string[] = [];
  const createdDocumentIds: string[] = [];
  const deterministicFailReasons: string[] = [];
  const startedAt = Date.now();
  let createdGakuchikaId: string | null = null;
  let finalText = "";
  let cleanupOk = true;
  let status: LiveAiConversationReportRow["status"] = "passed";
  let checks: LiveAiConversationCheck[] = [];
  let judge: LiveAiConversationJudge | null = null;

  try {
    await runMotivationSetup(
      page,
      company.id,
      input.selectedIndustry,
      input.selectedRole,
      input.motivation.answers,
    );

    const gakuchika = await createOwnedGakuchika(page, {
      title: input.gakuchika.title,
      content: input.gakuchika.content,
      charLimitType: input.gakuchika.charLimitType,
    });
    createdGakuchikaId = gakuchika.id;

    const gakuchikaComplete = await runGakuchikaSetup(
      page,
      gakuchika.id,
      input.gakuchika.answers,
    );
    if (gakuchikaComplete?.isCompleted !== true) {
      throw new Error("interview setup gakuchika did not complete");
    }

    const gakuchikaDraftResponse = await apiRequestAsAuthenticatedUser(page, "POST", `/api/gakuchika/${gakuchika.id}/generate-es-draft`, {
      charLimit: Number(input.gakuchika.charLimitType),
    });
    const gakuchikaDraft = JSON.parse(
      await expectOkResponse(gakuchikaDraftResponse, `interview gakuchika draft ${input.id}`),
    ) as { documentId: string };
    createdDocumentIds.push(gakuchikaDraft.documentId);

    const esDocument = await createOwnedDocument(page, {
      title: `${input.companyName} ES`,
      type: "es",
      companyId: company.id,
      content: [
        {
          id: `${input.id}-heading`,
          type: "h2",
          content: "志望動機",
          charLimit: 400,
        },
        {
          id: `${input.id}-body`,
          type: "paragraph",
          content: input.motivation.answers.join(" "),
        },
      ],
    });
    createdDocumentIds.push(esDocument.id);

    const startResponse = await apiRequestAsAuthenticatedUser(page, "POST", `/api/companies/${company.id}/interview/start`, {});
    const startEvents = parseSseEvents(await expectOkResponse(startResponse, `interview start ${input.id}`));
    const startComplete = parseCompleteData(startEvents);
    const initialQuestion = String(startComplete.question || collectChunks(startEvents, "question") || "");
    pushAssistantIfPresent(transcript, initialQuestion);
    expect(initialQuestion).toBeTruthy();
    expect(
      input.interview.expectedQuestionTokens.some((token) => initialQuestion.includes(token)),
    ).toBeTruthy();

    let messages = Array.isArray(startComplete.messages)
      ? (startComplete.messages as ChatMessage[])
      : [{ role: "assistant", content: initialQuestion }];

    for (const answer of input.interview.answers) {
      transcript.push({ role: "user", content: answer });
      messages = [...messages, { role: "user", content: answer }];

      const response = await apiRequestAsAuthenticatedUser(page, "POST", `/api/companies/${company.id}/interview/stream`, {
        messages,
      });
      const events = parseSseEvents(await expectOkResponse(response, `interview stream ${input.id}`));
      const complete = parseCompleteData(events);
      const nextQuestion = String(complete.question || collectChunks(events, "question") || "");
      pushAssistantIfPresent(transcript, nextQuestion);
      if (Array.isArray(complete.messages)) {
        messages = complete.messages as ChatMessage[];
      }
      finalText = nextQuestion || finalText;
    }

    const feedbackResponse = await apiRequestAsAuthenticatedUser(page, "POST", `/api/companies/${company.id}/interview/feedback`, {
      messages,
    });
    const feedbackEvents = parseSseEvents(await expectOkResponse(feedbackResponse, `interview feedback ${input.id}`));
    const feedbackComplete = parseCompleteData(feedbackEvents);
    const feedback = (feedbackComplete.feedback || null) as
      | {
          overall_comment?: string;
          improved_answer?: string;
          strengths?: string[];
          improvements?: string[];
        }
      | null;
    const feedbackSummary = [
      feedback?.overall_comment || "",
      feedback?.improved_answer || "",
      ...(feedback?.strengths || []),
      ...(feedback?.improvements || []),
    ].join(" ");
    const transcriptTexts = transcript.map((turn) => turn.content);
    const questionHit = countTokenHits(transcriptTexts, input.interview.expectedQuestionTokens);
    const feedbackHit = countTokenHits([feedbackSummary], input.interview.expectedFeedbackTokens);
    checks = buildChecks([
      {
        name: "interview-started",
        passed: Boolean(initialQuestion),
        evidence: [initialQuestion || "initialQuestion=empty"],
      },
      {
        name: "question-token-coverage",
        passed: questionHit >= 1,
        evidence: [`hits=${questionHit}/${input.interview.expectedQuestionTokens.length}`],
      },
      {
        name: "feedback-token-coverage",
        passed: feedbackHit >= 1,
        evidence: [`hits=${feedbackHit}/${input.interview.expectedFeedbackTokens.length}`],
      },
      {
        name: "feedback-generated",
        passed: Boolean(feedback?.overall_comment || feedback?.improved_answer),
        evidence: [feedback?.overall_comment || feedback?.improved_answer || "feedback=empty"],
      },
    ]);
    for (const check of checks) {
      expect(check.passed, `${input.id}:${check.name}`).toBeTruthy();
    }
    judge = buildJudge(
      "interview",
      transcript,
      feedbackSummary,
      input.interview.expectedQuestionTokens,
      input.interview.expectedFeedbackTokens,
    );
    finalText = feedback?.overall_comment || finalText;
  } catch (error) {
    status = "failed";
    deterministicFailReasons.push(error instanceof Error ? error.message : "unknown_error");
  } finally {
    for (const documentId of createdDocumentIds) {
      try {
        await deleteOwnedDocument(page, documentId);
        removedIds.push(documentId);
      } catch {
        cleanupOk = false;
      }
    }

    if (createdGakuchikaId) {
      try {
        await deleteOwnedGakuchika(page, createdGakuchikaId);
        removedIds.push(createdGakuchikaId);
      } catch {
        cleanupOk = false;
      }
    }

    try {
      await deleteOwnedCompany(page, company.id);
      removedIds.push(company.id);
    } catch {
      cleanupOk = false;
    }
  }

  const cleanupCheck = {
    name: "cleanup",
    passed: cleanupOk,
    evidence: cleanupOk ? removedIds : ["cleanup failed"],
  };
  checks = [...checks, cleanupCheck];
  if (!cleanupOk) {
    status = "failed";
    deterministicFailReasons.push("cleanup_failed");
  }
  const severity: LiveAiConversationReportRow["severity"] =
    status === "failed" ? "failed" : judge && !judge.overallPass ? "degraded" : "passed";

  return {
    feature: "interview",
    caseId: input.id,
    title: input.title,
    status,
    severity,
    durationMs: Date.now() - startedAt,
    transcript,
    outputs: { finalText, generatedDocumentId: null },
    deterministicFailReasons,
    checks,
    judge,
    cleanup: { ok: cleanupOk, removedIds },
  };
}

const gakuchikaCases = selectCases(
  readJsonCases<GakuchikaCase>("tests/ai_eval/gakuchika_cases.json"),
);
const motivationCases = selectCases(
  readJsonCases<MotivationCase>("tests/ai_eval/motivation_cases.json"),
);
const interviewCases = selectCases(
  readJsonCases<InterviewCase>("tests/ai_eval/interview_cases.json"),
);

const reportRowsByKey = new Map<string, LiveAiConversationReportRow>();

test.describe.serial("Live AI conversations", () => {
  test.beforeEach(async ({ page }) => {
    test.skip(
      !hasAuthenticatedUserAccess,
      "Authenticated user access is required for live conversation tests",
    );
    await signInAsAuthenticatedUser(page, "/dashboard");
  });

  for (const item of gakuchikaCases) {
    if (!shouldRunFeature("gakuchika")) continue;
    test(`gakuchika live: ${item.id}`, async ({ page }) => {
      test.setTimeout(LIVE_CONVERSATION_TEST_TIMEOUT_MS);
      const row = await runGakuchikaCase(page, item);
      reportRowsByKey.set(`${row.feature}:${row.caseId}`, row);
      expect(row.severity).not.toBe("failed");
    });
  }

  for (const item of motivationCases) {
    if (!shouldRunFeature("motivation")) continue;
    test(`motivation live: ${item.id}`, async ({ page }) => {
      test.setTimeout(LIVE_CONVERSATION_TEST_TIMEOUT_MS);
      const row = await runMotivationCase(page, item);
      reportRowsByKey.set(`${row.feature}:${row.caseId}`, row);
      expect(row.severity).not.toBe("failed");
    });
  }

  for (const item of interviewCases) {
    if (!shouldRunFeature("interview")) continue;
    test(`interview live: ${item.id}`, async ({ page }) => {
      test.setTimeout(LIVE_CONVERSATION_TEST_TIMEOUT_MS);
      const row = await runInterviewCase(page, item);
      reportRowsByKey.set(`${row.feature}:${row.caseId}`, row);
      expect(row.severity).not.toBe("failed");
    });
  }

  test.afterAll(async () => {
    const generatedAt = new Date();
    const rows = [...reportRowsByKey.values()];
    for (const feature of selectedFeatures()) {
      const featureRows = rows.filter((row) => row.feature === feature);
      const report = generateLiveAiConversationReport({
        reportType: feature,
        runId: RUN_ID,
        generatedAt: generatedAt.toISOString(),
        generatedAtStamp: toUtcStamp(generatedAt),
        suiteDepth: CASE_SET,
        targetEnv: TARGET_ENV,
        rows: featureRows.length > 0 ? featureRows : [buildMissingFeatureRow(feature)],
      });

      const result = await writeLiveAiConversationReport({
        outputDir: OUTPUT_DIR,
        report,
      });

      console.log(`wrote live AI conversation report: ${result.markdownPath}`);
    }
  });
});
