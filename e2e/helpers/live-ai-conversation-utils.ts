/**
 * Shared utilities for live AI conversation E2E tests.
 *
 * Contains only what the SSE smoke test needs:
 * - SSE parsing helpers
 * - Deterministic fallback answer builders
 * - Setup orchestrators (motivation, gakuchika)
 * - Stale-company cleanup utilities
 * - Core type definitions
 *
 * Quality checks (token coverage, draft length, judges, reports)
 * belong in pytest — not here.
 */

import {
  apiRequest,
  apiRequestAsAuthenticatedUser,
  deleteOwnedCompany,
  expectOkResponse,
} from "../fixtures/auth";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ParsedSseEvent = { type: string; [key: string]: unknown };
export type ChatMessage = { role: "assistant" | "user"; content: string };
export type SetupResponseLike = {
  ok(): boolean;
  status(): number;
  statusText(): string;
  text(): Promise<string>;
};
export type SetupRequester = typeof apiRequest;

// ---------------------------------------------------------------------------
// SSE parsing
// ---------------------------------------------------------------------------

export function parseSseEvents(rawText: string): ParsedSseEvent[] {
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

export function parseCompleteData(events: ParsedSseEvent[]) {
  const completeEvents = events.filter((event) => event.type === "complete");
  const completeEvent = completeEvents[completeEvents.length - 1];
  if (!completeEvent) {
    throw new Error("stream did not emit a complete event");
  }
  return (completeEvent.data || {}) as Record<string, unknown>;
}

export function isGakuchikaDraftReady(completeData: Record<string, unknown> | null | undefined) {
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
    nextAction === "show_interview_ready"
  );
}

export function collectChunks(events: ParsedSseEvent[], pathName: string): string {
  return events
    .filter((event) => event.type === "string_chunk" && event.path === pathName)
    .map((event) => String(event.text || ""))
    .join("");
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function pushAssistantIfPresent(
  transcript: Array<{ role: "assistant" | "user"; content: string }>,
  content: string,
) {
  if (content.trim()) {
    transcript.push({ role: "assistant", content });
  }
}

async function readSetupResponseBody(response: SetupResponseLike, label: string) {
  const body = await response.text().catch(() => "");
  if (!response.ok()) {
    throw new Error(
      `${label} failed with ${response.status()} ${response.statusText()}\n${body.slice(0, 1200)}`,
    );
  }
  return body;
}

// ---------------------------------------------------------------------------
// Deterministic fallback answers — motivation
// ---------------------------------------------------------------------------

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
      : typeof (input.latestComplete?.stageStatus as { current?: unknown } | undefined)?.current ===
          "string"
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
      input.attemptIndex % MOTIVATION_FALLBACK_ANSWERS.length
    ];
  })();

  return targetedAnswer;
}

// ---------------------------------------------------------------------------
// Deterministic fallback answers — gakuchika
// ---------------------------------------------------------------------------

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
    input.latestComplete?.conversationState &&
    typeof input.latestComplete.conversationState === "object"
      ? (input.latestComplete.conversationState as {
          focusKey?: unknown;
          missingElements?: unknown;
        })
      : null;
  const focusKey =
    typeof conversationState?.focusKey === "string"
      ? conversationState.focusKey
      : Array.isArray(conversationState?.missingElements)
        ? conversationState.missingElements.find(
            (value): value is string => typeof value === "string",
          ) || ""
        : "";
  const normalizedQuestion = input.nextQuestion.trim().replace(/\s+/g, "");

  const targetedAnswer = (() => {
    if (/(結果|変化|どれだけ|改善|成果|前後で|どのような変化|見られたか)/.test(normalizedQuestion)) {
      return GAKUCHIKA_FALLBACK_ANSWERS[3];
    }
    if (/(学び|今後|活か|再現)/.test(normalizedQuestion)) return GAKUCHIKA_FALLBACK_ANSWERS[4];
    if (/(基準|判断軸|優先|なぜその順番|どう決め)/.test(normalizedQuestion))
      return GAKUCHIKA_FALLBACK_ANSWERS[2];
    if (/(課題|きっかけ|どんな場面|背景)/.test(normalizedQuestion))
      return GAKUCHIKA_FALLBACK_ANSWERS[0];
    if (/(役割|どこまで判断|担当)/.test(normalizedQuestion)) return GAKUCHIKA_FALLBACK_ANSWERS[1];

    if (focusKey === "context" || focusKey === "challenge") return GAKUCHIKA_FALLBACK_ANSWERS[0];
    if (focusKey === "role" || focusKey === "task") return GAKUCHIKA_FALLBACK_ANSWERS[1];
    if (focusKey === "action" || focusKey === "action_reason") return GAKUCHIKA_FALLBACK_ANSWERS[2];
    if (focusKey === "result" || focusKey === "result_evidence") return GAKUCHIKA_FALLBACK_ANSWERS[3];
    if (focusKey === "learning" || focusKey === "learning_transfer")
      return GAKUCHIKA_FALLBACK_ANSWERS[4];

    return GAKUCHIKA_FALLBACK_ANSWERS[
      input.attemptIndex % GAKUCHIKA_FALLBACK_ANSWERS.length
    ];
  })();

  return targetedAnswer;
}

// ---------------------------------------------------------------------------
// Motivation setup orchestrator
// ---------------------------------------------------------------------------

async function startMotivationSetupWithRequest(
  request: SetupRequester,
  page: Parameters<typeof apiRequest>[0],
  companyId: string,
  selectedIndustry: string,
  selectedRole: string,
  transcript?: Array<{ role: "assistant" | "user"; content: string }>,
) {
  let startResponse = await request(
    page,
    "POST",
    `/api/motivation/${companyId}/conversation/start`,
    { selectedIndustry, selectedRole },
  );

  if (startResponse.status() === 409) {
    const resetResponse = await request(
      page,
      "DELETE",
      `/api/motivation/${companyId}/conversation`,
    );
    await readSetupResponseBody(resetResponse, `motivation setup reset ${companyId}`);
    startResponse = await request(
      page,
      "POST",
      `/api/motivation/${companyId}/conversation/start`,
      { selectedIndustry, selectedRole },
    );
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

  return { sessionId, nextQuestionText };
}

export async function runMotivationSetupWithRequest(
  request: SetupRequester,
  page: Parameters<typeof apiRequest>[0],
  companyId: string,
  selectedIndustry: string,
  selectedRole: string,
  answers: string[],
  transcript?: Array<{ role: "assistant" | "user"; content: string }>,
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
  const totalAttempts = Math.max(answers.length + MOTIVATION_FALLBACK_ANSWERS.length, 24);
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
    const streamResponse = await request(
      page,
      "POST",
      `/api/motivation/${companyId}/conversation/stream`,
      { answer, sessionId },
    );
    if (streamResponse.status() === 429 && motivationRateRetries < maxMotivationRateRetries) {
      motivationRateRetries += 1;
      transcript?.pop();
      attempt -= 1;
      await new Promise((r) => setTimeout(r, 2000 * motivationRateRetries));
      continue;
    }
    const events = parseSseEvents(
      await readSetupResponseBody(streamResponse, `motivation setup stream ${companyId}`),
    );
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

// ---------------------------------------------------------------------------
// Gakuchika setup orchestrator
// ---------------------------------------------------------------------------

export async function runGakuchikaSetupWithRequest(
  request: SetupRequester,
  page: Parameters<typeof apiRequest>[0],
  gakuchikaId: string,
  answers: string[],
  transcript?: Array<{ role: "assistant" | "user"; content: string }>,
) {
  const startResponse = await request(
    page,
    "POST",
    `/api/gakuchika/${gakuchikaId}/conversation/new`,
    {},
  );
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
  const totalAttempts = Math.max(answers.length + GAKUCHIKA_FALLBACK_ANSWERS.length, 24);
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
    const streamResponse = await request(
      page,
      "POST",
      `/api/gakuchika/${gakuchikaId}/conversation/stream`,
      { answer, sessionId },
    );
    if (streamResponse.status() === 429 && rateLimitRetries < maxRateLimitRetries) {
      rateLimitRetries += 1;
      transcript?.pop();
      attempt -= 1;
      await new Promise((r) => setTimeout(r, 2000 * rateLimitRetries));
      continue;
    }
    const events = parseSseEvents(
      await readSetupResponseBody(
        streamResponse,
        `gakuchika setup stream ${gakuchikaId}`,
      ),
    );
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

// ---------------------------------------------------------------------------
// Stale live-AI company cleanup
// ---------------------------------------------------------------------------

type OwnedCompanySummary = { id: string; name: string };

export function collectStaleLiveAiCompanyIds(
  companies: OwnedCompanySummary[],
  caseIds: string[],
) {
  return companies
    .filter(
      (company) =>
        company.name.includes("_live-ai-conversations-") &&
        caseIds.some((caseId) =>
          company.name.includes(`_${caseId}_live-ai-conversations-`),
        ),
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

export async function cleanupStaleLiveAiCompanies(
  page: Parameters<typeof apiRequest>[0],
  caseIds: string[],
) {
  const companies = await listOwnedCompanies(page);
  const staleIds = collectStaleLiveAiCompanyIds(companies, caseIds);
  for (const staleId of staleIds) {
    await deleteOwnedCompany(page, staleId);
  }
}
