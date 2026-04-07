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
  classifyLiveAiConversationFailure,
  generateLiveAiConversationReport,
  writeLiveAiConversationReport,
  type LiveAiConversationCheck,
  type LiveAiConversationFailureKind,
  type LiveAiConversationFeature,
  type LiveAiConversationJudge,
  type LiveAiConversationReportRow,
  type LiveAiConversationSuiteDepth,
  type LiveAiConversationTargetEnv,
  type LiveAiConversationTranscriptTurn,
} from "../src/lib/testing/live-ai-conversation-report";
import { maybeLiveAiConversationLlmJudge } from "../src/lib/testing/live-ai-conversation-llm-judge";

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
  /** Substrings that must not appear in transcript or draft (e.g. refusal boilerplate). */
  expectedForbiddenTokens?: string[];
  /** Each inner array is OR; every group must have at least one hit somewhere in assistant questions. */
  requiredQuestionTokenGroups?: string[][];
  minDraftCharCount?: number;
  maxDraftCharCount?: number;
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
  draftCharLimit?: 300 | 400 | 500;
  expectedForbiddenTokens?: string[];
  requiredQuestionTokenGroups?: string[][];
  minDraftCharCount?: number;
  maxDraftCharCount?: number;
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
    expectedForbiddenTokens?: string[];
    requiredQuestionTokenGroups?: string[][];
    minFeedbackCharCount?: number;
    maxFeedbackCharCount?: number;
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

/** When false (`LIVE_AI_CONVERSATION_BLOCKING_FAILURES=0`), only infra-like failureKind fails Playwright; state/quality stay report-only. */
const BLOCKING_CONVERSATION_FAILURES =
  process.env.LIVE_AI_CONVERSATION_BLOCKING_FAILURES?.trim() !== "0";

const BLOCKING_CONVERSATION_FAILURE_KINDS: LiveAiConversationFailureKind[] = [
  "auth",
  "cleanup",
  "timeout",
  "infra",
];

function assertConversationOutcome(row: LiveAiConversationReportRow) {
  if (row.severity !== "failed") {
    return;
  }
  const shouldFailPlaywright =
    BLOCKING_CONVERSATION_FAILURES ||
    BLOCKING_CONVERSATION_FAILURE_KINDS.includes(row.failureKind);
  if (shouldFailPlaywright) {
    expect(row.severity, `${row.feature}/${row.caseId} failureKind=${row.failureKind}`).not.toBe("failed");
  }
}

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
  const completeEvents = events.filter((event) => event.type === "complete");
  const completeEvent = completeEvents[completeEvents.length - 1];
  if (!completeEvent) {
    throw new Error("stream did not emit a complete event");
  }
  return (completeEvent.data || {}) as Record<string, unknown>;
}

function isGakuchikaDraftReady(completeData: Record<string, unknown> | null | undefined) {
  const conversationState =
    completeData?.conversationState && typeof completeData.conversationState === "object"
      ? (completeData.conversationState as { readyForDraft?: unknown; stage?: unknown })
      : null;
  const nextAction = typeof completeData?.nextAction === "string" ? completeData.nextAction : "";
  const stage = typeof conversationState?.stage === "string" ? conversationState.stage : "";

  return (
    completeData?.isCompleted === true ||
    completeData?.isInterviewReady === true ||
    conversationState?.readyForDraft === true ||
    stage === "draft_ready" ||
    stage === "interview_ready" ||
    nextAction === "show_generate_draft_cta" ||
    nextAction === "continue_deep_dive" ||
    nextAction === "show_interview_ready"
  );
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

function assistantQuestionTexts(transcript: LiveAiConversationTranscriptTurn[]): string[] {
  return transcript.filter((t) => t.role === "assistant").map((t) => t.content);
}

function buildForbiddenTokenChecks(
  label: string,
  texts: string[],
  forbidden: string[] | undefined,
): { checks: LiveAiConversationCheck[]; failCodes: string[] } {
  const checks: LiveAiConversationCheck[] = [];
  const failCodes: string[] = [];
  if (!forbidden?.length) {
    return { checks, failCodes };
  }
  const haystack = texts.join("\n");
  for (const tok of forbidden) {
    const hit = haystack.includes(tok);
    checks.push({
      name: `${label}-forbidden-absent:${tok.slice(0, 24)}`,
      passed: !hit,
      evidence: hit ? [`found:${tok.slice(0, 40)}`] : ["ok"],
    });
    if (hit) {
      failCodes.push(`forbidden_token:${tok}`);
    }
  }
  return { checks, failCodes };
}

function buildRequiredQuestionGroupChecks(
  questionTexts: string[],
  groups: string[][] | undefined,
): { checks: LiveAiConversationCheck[]; failCodes: string[] } {
  const checks: LiveAiConversationCheck[] = [];
  const failCodes: string[] = [];
  if (!groups?.length) {
    return { checks, failCodes };
  }
  let satisfied = 0;
  for (const group of groups) {
    if (group.some((tok) => questionTexts.some((q) => q.includes(tok)))) {
      satisfied += 1;
    }
  }
  const ok = satisfied === groups.length;
  checks.push({
    name: "required-question-token-groups",
    passed: ok,
    evidence: [`satisfied_groups=${satisfied}/${groups.length}`],
  });
  if (!ok) {
    failCodes.push("required_question_group_miss");
  }
  return { checks, failCodes };
}

function buildDraftLengthChecks(
  finalText: string,
  minC: number | undefined,
  maxC: number | undefined,
): { checks: LiveAiConversationCheck[]; failCodes: string[] } {
  const checks: LiveAiConversationCheck[] = [];
  const failCodes: string[] = [];
  if (minC != null) {
    const ok = finalText.length >= minC;
    checks.push({
      name: "min-draft-chars",
      passed: ok,
      evidence: [`len=${finalText.length} min=${minC}`],
    });
    if (!ok) {
      failCodes.push(`draft_too_short:${finalText.length}<${minC}`);
    }
  }
  if (maxC != null) {
    const ok = finalText.length <= maxC;
    checks.push({
      name: "max-draft-chars",
      passed: ok,
      evidence: [`len=${finalText.length} max=${maxC}`],
    });
    if (!ok) {
      failCodes.push(`draft_too_long:${finalText.length}>${maxC}`);
    }
  }
  return { checks, failCodes };
}

function buildFeedbackLengthChecks(
  feedbackSummary: string,
  minC: number | undefined,
  maxC: number | undefined,
): { checks: LiveAiConversationCheck[]; failCodes: string[] } {
  const checks: LiveAiConversationCheck[] = [];
  const failCodes: string[] = [];
  if (minC != null) {
    const ok = feedbackSummary.length >= minC;
    checks.push({
      name: "min-feedback-chars",
      passed: ok,
      evidence: [`len=${feedbackSummary.length} min=${minC}`],
    });
    if (!ok) {
      failCodes.push(`feedback_too_short:${feedbackSummary.length}<${minC}`);
    }
  }
  if (maxC != null) {
    const ok = feedbackSummary.length <= maxC;
    checks.push({
      name: "max-feedback-chars",
      passed: ok,
      evidence: [`len=${feedbackSummary.length} max=${maxC}`],
    });
    if (!ok) {
      failCodes.push(`feedback_too_long:${feedbackSummary.length}>${maxC}`);
    }
  }
  return { checks, failCodes };
}

function mergeExtendedDeterministic(
  parts: Array<{ checks: LiveAiConversationCheck[]; failCodes: string[] }>,
): { checks: LiveAiConversationCheck[]; failCodes: string[] } {
  return {
    checks: parts.flatMap((p) => p.checks),
    failCodes: parts.flatMap((p) => p.failCodes),
  };
}

function buildMissingFeatureRow(feature: LiveAiConversationFeature): LiveAiConversationReportRow {
  return {
    feature,
    caseId: "__missing_report__",
    title: `${feature} live suite failed before report rows were recorded`,
    status: "failed",
    severity: "failed",
    failureKind: "infra",
    durationMs: 0,
    transcript: [],
    outputs: { finalText: "", generatedDocumentId: null },
    deterministicFailReasons: ["missing_report", "suite_failed_before_report_rows"],
    representativeLog: "no feature rows were captured before afterAll",
    representativeError: null,
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

type OwnedCompanySummary = { id: string; name: string };

export function collectStaleLiveAiCompanyIds(
  companies: OwnedCompanySummary[],
  caseIds: string[],
) {
  return companies
    .filter((company) =>
      company.name.includes("_live-ai-conversations-") &&
      caseIds.some((caseId) => company.name.includes(`_${caseId}_live-ai-conversations-`)),
    )
    .map((company) => company.id);
}

async function listOwnedCompanies(page: Parameters<typeof apiRequest>[0]) {
  const response = await apiRequestAsAuthenticatedUser(page, "GET", "/api/companies");
  const body = JSON.parse(
    await expectOkResponse(response, "list owned companies"),
  ) as { companies: OwnedCompanySummary[] };
  return body.companies;
}

async function cleanupStaleLiveAiCompanies(
  page: Parameters<typeof apiRequest>[0],
  caseIds: string[],
) {
  const companies = await listOwnedCompanies(page);
  const staleIds = collectStaleLiveAiCompanyIds(companies, caseIds);
  for (const staleId of staleIds) {
    await deleteOwnedCompany(page, staleId);
  }
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
  const totalAttempts = Math.max(answers.length + MOTIVATION_FALLBACK_ANSWERS.length, 16);
  let motivationRateRetries = 0;
  const maxMotivationRateRetries = 12;

  for (let attempt = 0; attempt < totalAttempts; attempt += 1) {
    const answer =
      attempt < answers.length
        ? answers[attempt]
        : buildDeterministicMotivationFollowupAnswer({
            nextQuestion: nextQuestionText,
            attemptIndex: attempt - answers.length,
            latestComplete,
          });
    transcript?.push({ role: "user", content: answer });
    const streamResponse = await request(page, "POST", `/api/motivation/${companyId}/conversation/stream`, {
      answer,
      sessionId,
    });
    if (streamResponse.status() === 429 && motivationRateRetries < maxMotivationRateRetries) {
      motivationRateRetries += 1;
      transcript?.pop();
      attempt -= 1;
      await new Promise((r) => setTimeout(r, 2000 * motivationRateRetries));
      continue;
    }
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
  "大学の企画運営で非効率な進行を立て直した経験から、仕組みで顧客課題を減らせる仕事に関心を持ちました。",
  "株式会社テストDXはDX推進を通じて現場課題を整理し改善まで伴走できる点が魅力です。",
  "大学では関係者の意見を整理し、優先順位を決めて改善を進めたため、企画職でもその強みを活かせます。",
  "入社後は現場に近い位置で課題を構造化し、提案から実行までやり切る企画として価値を出したいです。",
  "他社よりも御社を志望するのは、若手でも仮説を持って改善提案できる環境があると感じているからです。",
];

const MOTIVATION_EXPERIENCE_FALLBACKS = [
  "学園祭運営で申請漏れが重なり、確認フローを整理して混乱を減らした経験が原体験です。",
  "ゼミの共同発表で情報共有の型を作った結果、準備の抜け漏れが減り、仕組みで現場を楽にできると実感しました。",
  "大学の企画運営で現場の負荷を下げる改善を続けた経験から、課題整理を仕事にしたいと考えるようになりました。",
];

export function buildDeterministicMotivationFollowupAnswer(input: {
  nextQuestion: string;
  attemptIndex: number;
  latestComplete?: Record<string, unknown> | null;
}) {
  const questionStage =
    typeof input.latestComplete?.questionStage === "string"
      ? input.latestComplete.questionStage
      : typeof (input.latestComplete?.stageStatus as { current?: unknown } | undefined)?.current === "string"
        ? String((input.latestComplete?.stageStatus as { current?: unknown }).current)
        : "";
  const question = input.nextQuestion.trim();
  const normalizedQuestion = question.replace(/\s+/g, "");

  const targetedAnswer = (() => {
    if (questionStage === "industry_reason") {
      return "学園祭運営で申請と連絡の流れを整理し、確認漏れを減らした経験から、業務改革で顧客課題を減らせるIT業界を志望しています。";
    }

    if (questionStage === "company_reason") {
      return "株式会社テストDXは現場の業務改革を企画から実装まで支援しており、企画職として課題整理から提案まで担える点に魅力を感じています。";
    }

    if (questionStage === "self_connection") {
      return "大学の企画運営では関係者の要望を整理し、優先順位を決めて改善を進めてきたため、企画職でも論点整理と巻き込み力を活かせます。";
    }

    if (questionStage === "desired_work") {
      return "入社後は現場ヒアリングを通じて課題を構造化し、実行可能な改善企画に落とし込む役割を担いたいです。";
    }

    if (questionStage === "value_contribution") {
      return "まずは利用部門の声を定量・定性の両面で整理し、関係者を巻き込みながら改善提案を前に進めたいです。";
    }

    if (questionStage === "differentiation") {
      return "他社比較では事業の広さより、顧客業務に入り込み改善を回し続けられる点で御社の志望度が高いです。";
    }

    if (
      normalizedQuestion.includes("他社") ||
      normalizedQuestion.includes("御社") ||
      normalizedQuestion.includes("この会社") ||
      normalizedQuestion.includes("選ぶ理由") ||
      normalizedQuestion.includes("志望理由")
    ) {
      return "他社よりも御社を志望するのは、DX推進で現場課題を構造化し、若手でも改善提案まで担える環境に魅力を感じているからです。";
    }

    if (
      normalizedQuestion.includes("原体験") ||
      normalizedQuestion.includes("きっかけ") ||
      normalizedQuestion.includes("経験") ||
      normalizedQuestion.includes("関心を持った")
    ) {
      return MOTIVATION_EXPERIENCE_FALLBACKS[
        input.attemptIndex % MOTIVATION_EXPERIENCE_FALLBACKS.length
      ];
    }

    if (
      normalizedQuestion.includes("印象に残っている場面") ||
      normalizedQuestion.includes("どの場面") ||
      normalizedQuestion.includes("最初のきっかけ")
    ) {
      return "学園祭準備で申請状況の共有が曖昧で当日対応が遅れた場面があり、関係者一覧と確認フローを作って改善したことが印象に残っています。";
    }

    if (
      normalizedQuestion.includes("企画職") ||
      normalizedQuestion.includes("活かせる") ||
      normalizedQuestion.includes("強み") ||
      normalizedQuestion.includes("再現")
    ) {
      return "大学では関係者の意見を整理し、優先順位を決めて改善を進めてきたため、企画職でも論点整理と巻き込み力を活かして貢献できます。";
    }

    if (
      normalizedQuestion.includes("入社後") ||
      normalizedQuestion.includes("挑戦") ||
      normalizedQuestion.includes("やりたい") ||
      normalizedQuestion.includes("貢献")
    ) {
      return "入社後は現場に近い位置で課題を構造化し、関係者を巻き込みながら提案から実行までやり切る企画として価値を出したいです。";
    }

    if (
      normalizedQuestion.includes("IT・通信") ||
      normalizedQuestion.includes("業界") ||
      normalizedQuestion.includes("顧客課題") ||
      normalizedQuestion.includes("業務改革")
    ) {
      return "IT・通信業界を志望するのは、仕組みや業務改革によって顧客課題を継続的に減らせる点に魅力を感じているからです。";
    }

    return MOTIVATION_FALLBACK_ANSWERS[
      Math.min(input.attemptIndex, MOTIVATION_FALLBACK_ANSWERS.length - 1)
    ];
  })();

  return targetedAnswer;
}

const GAKUCHIKA_FALLBACK_ANSWERS = [
  "宿題未提出が続く生徒が増え、保護者からも学習習慣への相談が続いていたため、校舎全体で対応を見直す必要がありました。",
  "私は担当講師としてだけでなく、他の講師も同じ基準で動けるように共有フォーマットを整える役割も担いました。",
  "宿題提出率と面談メモを見て要注意生徒から優先して声かけし、週次ミーティングで改善提案を回しました。",
  "その結果、宿題提出率が上がり、保護者相談への初期対応も早くなって学習継続率の改善につながりました。",
  "数字と現場の声を両方見て基準をそろえることで、個人依存ではなく再現性ある改善になると学びました。",
];

export function buildDeterministicGakuchikaFollowupAnswer(input: {
  nextQuestion: string;
  attemptIndex: number;
  latestComplete?: Record<string, unknown> | null;
}) {
  const conversationState =
    input.latestComplete?.conversationState && typeof input.latestComplete.conversationState === "object"
      ? (input.latestComplete.conversationState as { focusKey?: unknown; missingElements?: unknown })
      : null;
  const focusKey =
    typeof conversationState?.focusKey === "string"
      ? conversationState.focusKey
      : Array.isArray(conversationState?.missingElements)
        ? conversationState.missingElements.find((value): value is string => typeof value === "string") || ""
        : "";
  const normalizedQuestion = input.nextQuestion.trim().replace(/\s+/g, "");

  const targetedAnswer = (() => {
    // Prefer explicit question intent over backend focusKey so we do not loop on e.g. "role" while the model asks for outcomes.
    if (/(結果|変化|どれだけ|改善|成果|前後で|どのような変化|見られたか)/.test(normalizedQuestion)) {
      return GAKUCHIKA_FALLBACK_ANSWERS[3];
    }
    if (/(学び|今後|活か|再現)/.test(normalizedQuestion)) return GAKUCHIKA_FALLBACK_ANSWERS[4];
    if (/(基準|判断軸|優先|なぜその順番|どう決め)/.test(normalizedQuestion)) return GAKUCHIKA_FALLBACK_ANSWERS[2];
    if (/(課題|きっかけ|どんな場面|背景)/.test(normalizedQuestion)) return GAKUCHIKA_FALLBACK_ANSWERS[0];
    if (/(役割|どこまで判断|担当)/.test(normalizedQuestion)) return GAKUCHIKA_FALLBACK_ANSWERS[1];

    if (focusKey === "context" || focusKey === "challenge") return GAKUCHIKA_FALLBACK_ANSWERS[0];
    if (focusKey === "role" || focusKey === "task") return GAKUCHIKA_FALLBACK_ANSWERS[1];
    if (focusKey === "action" || focusKey === "action_reason") return GAKUCHIKA_FALLBACK_ANSWERS[2];
    if (focusKey === "result" || focusKey === "result_evidence") return GAKUCHIKA_FALLBACK_ANSWERS[3];
    if (focusKey === "learning" || focusKey === "learning_transfer") return GAKUCHIKA_FALLBACK_ANSWERS[4];

    return GAKUCHIKA_FALLBACK_ANSWERS[
      Math.min(input.attemptIndex, GAKUCHIKA_FALLBACK_ANSWERS.length - 1)
    ];
  })();

  return targetedAnswer;
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
  const totalAttempts = Math.max(answers.length + GAKUCHIKA_FALLBACK_ANSWERS.length, 16);
  let rateLimitRetries = 0;
  const maxRateLimitRetries = 12;
  for (let attempt = 0; attempt < totalAttempts; attempt += 1) {
    const answer =
      attempt < answers.length
        ? answers[attempt]
        : buildDeterministicGakuchikaFollowupAnswer({
            nextQuestion: nextQuestionText,
            attemptIndex: attempt - answers.length,
            latestComplete,
          });
    transcript?.push({ role: "user", content: answer });
    const streamResponse = await request(page, "POST", `/api/gakuchika/${gakuchikaId}/conversation/stream`, {
      answer,
      sessionId,
    });
    if (streamResponse.status() === 429 && rateLimitRetries < maxRateLimitRetries) {
      rateLimitRetries += 1;
      transcript?.pop();
      attempt -= 1;
      await new Promise((r) => setTimeout(r, 2000 * rateLimitRetries));
      continue;
    }
    const events = parseSseEvents(await readSetupResponseBody(streamResponse, `gakuchika setup stream ${gakuchikaId}`));
    const nextQuestion = collectChunks(events, "question");
    latestComplete = parseCompleteData(events);
    nextQuestionText = String(latestComplete?.nextQuestion || nextQuestion || "");
    pushAssistantIfPresent(transcript ?? [], nextQuestionText);
    if (isGakuchikaDraftReady(latestComplete)) {
      return latestComplete;
    }
  }

  throw new Error("gakuchika conversation did not reach draft_ready");
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
  let representativeLog: string | null = null;
  let representativeError: string | null = null;
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
        name: "draft-ready",
        passed: isGakuchikaDraftReady(latestComplete),
        evidence: [
          `isCompleted=${String(latestComplete?.isCompleted)}`,
          `isInterviewReady=${String(latestComplete?.isInterviewReady)}`,
          `nextAction=${String(latestComplete?.nextAction || "")}`,
          `readyForDraft=${String((latestComplete?.conversationState as { readyForDraft?: unknown } | undefined)?.readyForDraft)}`,
        ],
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
    const questionOnly = assistantQuestionTexts(transcript);
    const extendedDeterministic = mergeExtendedDeterministic([
      buildForbiddenTokenChecks(
        "gakuchika",
        [...transcript.map((t) => t.content), finalText],
        input.expectedForbiddenTokens,
      ),
      buildRequiredQuestionGroupChecks(questionOnly, input.requiredQuestionTokenGroups),
      buildDraftLengthChecks(finalText, input.minDraftCharCount, input.maxDraftCharCount),
    ]);
    checks = [...checks, ...extendedDeterministic.checks];
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
    const llmJudge = await maybeLiveAiConversationLlmJudge({
      feature: "gakuchika",
      caseId: input.id,
      title: input.title,
      transcript,
      finalText,
    });
    if (llmJudge) {
      judge = llmJudge;
    }
    if (judge?.blocking && judge.enabled && !judge.overallPass) {
      throw new Error(`${input.id}:llm_judge_blocking_fail`);
    }
  } catch (error) {
    status = "failed";
    const errorMessage = error instanceof Error ? error.message : "unknown_error";
    deterministicFailReasons.push(errorMessage);
    representativeError = errorMessage;
    representativeLog = "gakuchika setup failed before ES draft generation";
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
    representativeLog = representativeLog ?? "cleanup failed while deleting gakuchika artifacts";
  }
  const severity: LiveAiConversationReportRow["severity"] =
    status === "failed" ? "failed" : judge && !judge.overallPass ? "degraded" : "passed";
  const failureKind = classifyLiveAiConversationFailure({
    status,
    cleanupOk,
    deterministicFailReasons,
    judge,
  });
  if (failureKind === "quality" && judge?.warnings.length) {
    representativeLog = representativeLog ?? judge.warnings[0];
  }
  representativeError = representativeError ?? deterministicFailReasons.find((reason) => reason !== "cleanup_failed") ?? null;
  if (failureKind === "none") {
    representativeLog = null;
    representativeError = null;
  }

  return {
    feature: "gakuchika",
    caseId: input.id,
    title: input.title,
    status,
    severity,
    failureKind,
    durationMs: Date.now() - startedAt,
    transcript,
    outputs: { finalText, generatedDocumentId },
    deterministicFailReasons,
    representativeLog,
    representativeError,
    checks,
    judge,
    cleanup: { ok: cleanupOk, removedIds },
  };
}

async function runMotivationCase(
  page: Parameters<typeof apiRequest>[0],
  input: MotivationCase,
): Promise<LiveAiConversationReportRow> {
  await cleanupStaleLiveAiCompanies(page, LIVE_COMPANY_CASE_IDS);
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
  let representativeLog: string | null = null;
  let representativeError: string | null = null;
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

    const draftCharLimit = input.draftCharLimit ?? 400;
    const draftResponse = await apiRequestAsAuthenticatedUser(page, "POST", `/api/motivation/${company.id}/generate-draft`, {
      charLimit: draftCharLimit,
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
    const motivationQuestionOnly = assistantQuestionTexts(transcript);
    const motivationExtended = mergeExtendedDeterministic([
      buildForbiddenTokenChecks(
        "motivation",
        [...transcript.map((t) => t.content), finalText],
        input.expectedForbiddenTokens,
      ),
      buildRequiredQuestionGroupChecks(motivationQuestionOnly, input.requiredQuestionTokenGroups),
      buildDraftLengthChecks(finalText, input.minDraftCharCount, input.maxDraftCharCount),
    ]);
    checks = [...checks, ...motivationExtended.checks];
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
    const motivationLlmJudge = await maybeLiveAiConversationLlmJudge({
      feature: "motivation",
      caseId: input.id,
      title: input.title,
      transcript,
      finalText,
    });
    if (motivationLlmJudge) {
      judge = motivationLlmJudge;
    }
    if (judge?.blocking && judge.enabled && !judge.overallPass) {
      throw new Error(`${input.id}:llm_judge_blocking_fail`);
    }
  } catch (error) {
    status = "failed";
    const errorMessage = error instanceof Error ? error.message : "unknown_error";
    deterministicFailReasons.push(errorMessage);
    representativeError = errorMessage;
    representativeLog = "motivation setup failed before draft generation";
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
    representativeLog = representativeLog ?? "cleanup failed while deleting motivation artifacts";
  }
  const severity: LiveAiConversationReportRow["severity"] =
    status === "failed" ? "failed" : judge && !judge.overallPass ? "degraded" : "passed";
  const failureKind = classifyLiveAiConversationFailure({
    status,
    cleanupOk,
    deterministicFailReasons,
    judge,
  });
  if (failureKind === "quality" && judge?.warnings.length) {
    representativeLog = representativeLog ?? judge.warnings[0];
  }
  representativeError = representativeError ?? deterministicFailReasons.find((reason) => reason !== "cleanup_failed") ?? null;
  if (failureKind === "none") {
    representativeLog = null;
    representativeError = null;
  }

  return {
    feature: "motivation",
    caseId: input.id,
    title: input.title,
    status,
    severity,
    failureKind,
    durationMs: Date.now() - startedAt,
    transcript,
    outputs: { finalText, generatedDocumentId },
    deterministicFailReasons,
    representativeLog,
    representativeError,
    checks,
    judge,
    cleanup: { ok: cleanupOk, removedIds },
  };
}

async function runInterviewCase(
  page: Parameters<typeof apiRequest>[0],
  input: InterviewCase,
): Promise<LiveAiConversationReportRow> {
  await cleanupStaleLiveAiCompanies(page, LIVE_COMPANY_CASE_IDS);
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
  let representativeLog: string | null = null;
  let representativeError: string | null = null;
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
    if (!isGakuchikaDraftReady(gakuchikaComplete)) {
      throw new Error("interview setup gakuchika did not reach draft_ready");
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
    const interviewQuestionOnly = assistantQuestionTexts(transcript);
    const interviewExtended = mergeExtendedDeterministic([
      buildForbiddenTokenChecks(
        "interview",
        [...transcriptTexts, feedbackSummary],
        input.interview.expectedForbiddenTokens,
      ),
      buildRequiredQuestionGroupChecks(interviewQuestionOnly, input.interview.requiredQuestionTokenGroups),
      buildFeedbackLengthChecks(
        feedbackSummary,
        input.interview.minFeedbackCharCount,
        input.interview.maxFeedbackCharCount,
      ),
    ]);
    checks = [...checks, ...interviewExtended.checks];
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
    const interviewLlmJudge = await maybeLiveAiConversationLlmJudge({
      feature: "interview",
      caseId: input.id,
      title: input.title,
      transcript,
      finalText: feedbackSummary,
    });
    if (interviewLlmJudge) {
      judge = interviewLlmJudge;
    }
    if (judge?.blocking && judge.enabled && !judge.overallPass) {
      throw new Error(`${input.id}:llm_judge_blocking_fail`);
    }
    finalText = feedback?.overall_comment || finalText;
  } catch (error) {
    status = "failed";
    const errorMessage = error instanceof Error ? error.message : "unknown_error";
    deterministicFailReasons.push(errorMessage);
    representativeError = errorMessage;
    representativeLog = "interview setup failed before feedback generation";
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
    representativeLog = representativeLog ?? "cleanup failed while deleting interview artifacts";
  }
  const severity: LiveAiConversationReportRow["severity"] =
    status === "failed" ? "failed" : judge && !judge.overallPass ? "degraded" : "passed";
  const failureKind = classifyLiveAiConversationFailure({
    status,
    cleanupOk,
    deterministicFailReasons,
    judge,
  });
  if (failureKind === "quality" && judge?.warnings.length) {
    representativeLog = representativeLog ?? judge.warnings[0];
  }
  representativeError = representativeError ?? deterministicFailReasons.find((reason) => reason !== "cleanup_failed") ?? null;
  if (failureKind === "none") {
    representativeLog = null;
    representativeError = null;
  }

  return {
    feature: "interview",
    caseId: input.id,
    title: input.title,
    status,
    severity,
    failureKind,
    durationMs: Date.now() - startedAt,
    transcript,
    outputs: { finalText, generatedDocumentId: null },
    deterministicFailReasons,
    representativeLog,
    representativeError,
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
const LIVE_COMPANY_CASE_IDS = [...motivationCases, ...interviewCases].map((item) => item.id);

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
      assertConversationOutcome(row);
    });
  }

  for (const item of motivationCases) {
    if (!shouldRunFeature("motivation")) continue;
    test(`motivation live: ${item.id}`, async ({ page }) => {
      test.setTimeout(LIVE_CONVERSATION_TEST_TIMEOUT_MS);
      const row = await runMotivationCase(page, item);
      reportRowsByKey.set(`${row.feature}:${row.caseId}`, row);
      assertConversationOutcome(row);
    });
  }

  for (const item of interviewCases) {
    if (!shouldRunFeature("interview")) continue;
    test(`interview live: ${item.id}`, async ({ page }) => {
      test.setTimeout(LIVE_CONVERSATION_TEST_TIMEOUT_MS);
      const row = await runInterviewCase(page, item);
      reportRowsByKey.set(`${row.feature}:${row.caseId}`, row);
      assertConversationOutcome(row);
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
