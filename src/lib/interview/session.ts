export const ROLE_TRACK_OPTIONS = [
  "biz_general",
  "it_product",
  "consulting",
  "research_specialist",
  "quant_finance",
] as const;

export const INTERVIEW_FORMAT_OPTIONS = [
  "standard_behavioral",
  "case",
  "technical",
  "life_history",
] as const;

export const SELECTION_TYPE_OPTIONS = ["internship", "fulltime"] as const;
export const INTERVIEW_STAGE_OPTIONS = ["early", "mid", "final"] as const;
export const INTERVIEWER_TYPE_OPTIONS = ["hr", "line_manager", "executive", "mixed_panel"] as const;
export const STRICTNESS_MODE_OPTIONS = ["supportive", "standard", "strict"] as const;

export type InterviewRoleTrack = (typeof ROLE_TRACK_OPTIONS)[number];
export type InterviewFormat = (typeof INTERVIEW_FORMAT_OPTIONS)[number];
export type InterviewSelectionType = (typeof SELECTION_TYPE_OPTIONS)[number];
export type InterviewRoundStage = (typeof INTERVIEW_STAGE_OPTIONS)[number];
export type InterviewerType = (typeof INTERVIEWER_TYPE_OPTIONS)[number];
export type InterviewStrictnessMode = (typeof STRICTNESS_MODE_OPTIONS)[number];

/** DB/API の旧値 discussion / presentation → life_history（4 方式に整合） */
const LEGACY_INTERVIEW_FORMAT_MAP: Record<string, InterviewFormat> = {
  discussion: "life_history",
  presentation: "life_history",
};

export function canonicalizeInterviewFormat(value: string | null | undefined): InterviewFormat {
  const raw = typeof value === "string" ? value.trim() : "";
  const mapped = LEGACY_INTERVIEW_FORMAT_MAP[raw] ?? raw;
  return (INTERVIEW_FORMAT_OPTIONS as readonly string[]).includes(mapped) ? (mapped as InterviewFormat) : "standard_behavioral";
}

const KNOWN_INTERVIEW_FORMAT_SLUGS = new Set<string>([
  ...INTERVIEW_FORMAT_OPTIONS,
  "discussion",
  "presentation",
]);

/** POST ボディ等: 未対応スラッグは null（デフォルトは呼び出し側でコンテキストから決める） */
export function parseInterviewFormatParam(value: string | null | undefined): InterviewFormat | null {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw || !KNOWN_INTERVIEW_FORMAT_SLUGS.has(raw)) return null;
  return canonicalizeInterviewFormat(raw);
}

export type InterviewPlan = {
  interviewType: string;
  priorityTopics: string[];
  openingTopic: string | null;
  mustCoverTopics: string[];
  riskTopics: string[];
  suggestedTimeflow: string[];
};

export type InterviewCoverageStatus = "pending" | "active" | "covered" | "exhausted";

export type InterviewCoverageState = {
  topic: string;
  status: InterviewCoverageStatus;
  requiredChecklist: string[];
  passedChecklistKeys: string[];
  deterministicCoveragePassed: boolean;
  llmCoverageHint: string | null;
  deepeningCount: number;
  lastCoveredTurnId: string | null;
};

export type InterviewRecentQuestionSummaryV2 = {
  intentKey: string;
  normalizedSummary: string;
  topic: string | null;
  followupStyle: string | null;
  turnId: string | null;
};

export type InterviewFormatPhase =
  | "opening"
  | "standard_main"
  | "case_main"
  | "case_closing"
  | "technical_main"
  | "life_history_main"
  | "feedback";

export type InterviewStageStatus = {
  currentTopicLabel: string | null;
  coveredTopics: string[];
  remainingTopics: string[];
};

export type InterviewTurnMeta = {
  topic: string | null;
  turnAction: "ask" | "deepen" | "shift";
  focusReason: string | null;
  depthFocus: string | null;
  followupStyle: string | null;
  shouldMoveNext: boolean;
  interviewSetupNote?: string | null;
  intentKey?: string | null;
  formatGuardApplied?: string | null;
  coverageDecision?: string | null;
  checklistDelta?: string[] | null;
};

export type InterviewTurnState = {
  turnCount: number;
  currentTopic: string | null;
  coverageState: InterviewCoverageState[];
  coveredTopics: string[];
  remainingTopics: string[];
  recentQuestionSummariesV2: InterviewRecentQuestionSummaryV2[];
  formatPhase: InterviewFormatPhase;
  lastQuestion: string | null;
  lastAnswer: string | null;
  lastTopic: string | null;
  currentTurnMeta: InterviewTurnMeta | null;
  nextAction: "ask" | "feedback";
};

export function classifyInterviewRoleTrack(role: string | null | undefined): InterviewRoleTrack {
  const text = (role || "").trim();
  if (!text) return "biz_general";
  if (/クオンツ|数理|アクチュアリ|トレーディング/i.test(text)) return "quant_finance";
  if (/研究|研究員|R&D|シンクタンク|リサーチ/i.test(text)) return "research_specialist";
  if (/コンサル|consult/i.test(text)) return "consulting";
  if (/IT|DX|プロダクト|PdM|PM|エンジニア|開発|データ|SRE|アプリ/i.test(text)) return "it_product";
  return "biz_general";
}

function normalizeStringArray(value: unknown, maxItems = 16) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, maxItems);
}

function normalizeOptionalString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function normalizeCoverageState(value: unknown): InterviewCoverageState[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is Record<string, unknown> => !!item && typeof item === "object")
    .map((item) => ({
      topic: normalizeOptionalString(item.topic) ?? "unknown_topic",
      status: (
        item.status === "active" || item.status === "covered" || item.status === "exhausted"
          ? item.status
          : "pending"
      ) as InterviewCoverageStatus,
      requiredChecklist: normalizeStringArray(item.requiredChecklist),
      passedChecklistKeys: normalizeStringArray(item.passedChecklistKeys),
      deterministicCoveragePassed: item.deterministicCoveragePassed === true,
      llmCoverageHint: normalizeOptionalString(item.llmCoverageHint),
      deepeningCount:
        typeof item.deepeningCount === "number" && Number.isFinite(item.deepeningCount) && item.deepeningCount >= 0
          ? Math.floor(item.deepeningCount)
          : 0,
      lastCoveredTurnId: normalizeOptionalString(item.lastCoveredTurnId),
    }))
    .slice(0, 24);
}

function normalizeRecentQuestionSummariesV2(value: unknown): InterviewRecentQuestionSummaryV2[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is Record<string, unknown> => !!item && typeof item === "object")
    .map((item) => ({
      intentKey: normalizeOptionalString(item.intentKey) ?? "unknown_intent",
      normalizedSummary: normalizeOptionalString(item.normalizedSummary) ?? "",
      topic: normalizeOptionalString(item.topic),
      followupStyle: normalizeOptionalString(item.followupStyle),
      turnId: normalizeOptionalString(item.turnId),
    }))
    .filter((item) => item.normalizedSummary.length > 0)
    .slice(0, 8);
}

function normalizeFormatPhase(value: unknown): InterviewFormatPhase {
  const mapped =
    value === "discussion_main" || value === "presentation_main" ? "life_history_main" : value;
  switch (mapped) {
    case "standard_main":
    case "case_main":
    case "case_closing":
    case "technical_main":
    case "life_history_main":
    case "feedback":
      return mapped;
    default:
      return "opening";
  }
}

export function normalizeInterviewTurnMeta(
  value: Partial<InterviewTurnMeta> | null | undefined,
): InterviewTurnMeta | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const raw = value as Partial<InterviewTurnMeta> & {
    turn_action?: unknown;
    focus_reason?: unknown;
    depth_focus?: unknown;
    followup_style?: unknown;
    should_move_next?: unknown;
    interview_setup_note?: unknown;
    intent_key?: unknown;
    format_guard_applied?: unknown;
    coverage_decision?: unknown;
    checklist_delta?: unknown;
  };

  return {
    topic: normalizeOptionalString(raw.topic),
    turnAction:
      raw.turnAction === "shift" || raw.turn_action === "shift"
        ? "shift"
        : raw.turnAction === "ask" || raw.turn_action === "ask"
          ? "ask"
          : "deepen",
    focusReason: normalizeOptionalString(raw.focusReason ?? raw.focus_reason),
    depthFocus: normalizeOptionalString(raw.depthFocus ?? raw.depth_focus),
    followupStyle: normalizeOptionalString(raw.followupStyle ?? raw.followup_style),
    shouldMoveNext: raw.shouldMoveNext === true || raw.should_move_next === true,
    interviewSetupNote: normalizeOptionalString(raw.interviewSetupNote ?? raw.interview_setup_note),
    intentKey: normalizeOptionalString(raw.intentKey ?? raw.intent_key),
    formatGuardApplied: normalizeOptionalString(raw.formatGuardApplied ?? raw.format_guard_applied),
    coverageDecision: normalizeOptionalString(raw.coverageDecision ?? raw.coverage_decision),
    checklistDelta: Array.isArray(raw.checklistDelta ?? raw.checklist_delta)
      ? normalizeStringArray((raw.checklistDelta ?? raw.checklist_delta) as unknown[], 16)
      : null,
  };
}

export function createInitialInterviewTurnState(): InterviewTurnState {
  return {
    turnCount: 0,
    currentTopic: null,
    coverageState: [],
    coveredTopics: [],
    remainingTopics: [],
    recentQuestionSummariesV2: [],
    formatPhase: "opening",
    lastQuestion: null,
    lastAnswer: null,
    lastTopic: null,
    currentTurnMeta: null,
    nextAction: "ask",
  };
}

export function normalizeInterviewTurnState(
  value: Partial<InterviewTurnState> | null | undefined,
): InterviewTurnState {
  const initial = createInitialInterviewTurnState();
  if (!value || typeof value !== "object") {
    return initial;
  }

  const raw = value as Partial<InterviewTurnState> & {
    currentStage?: unknown;
    questionCount?: unknown;
    turnMeta?: unknown;
    turn_meta?: unknown;
  };
  const meta = raw.currentTurnMeta ?? raw.turnMeta ?? raw.turn_meta;
  const currentTurnMeta: InterviewTurnMeta | null =
    meta && typeof meta === "object" ? normalizeInterviewTurnMeta(meta) : null;
  const coverageState = normalizeCoverageState(value.coverageState);
  const coveredTopics =
    normalizeStringArray(value.coveredTopics).length > 0
      ? normalizeStringArray(value.coveredTopics)
      : coverageState
          .filter((item) => item.deterministicCoveragePassed)
          .map((item) => item.topic);
  const recentQuestionSummariesV2 =
    normalizeRecentQuestionSummariesV2(value.recentQuestionSummariesV2).length > 0
      ? normalizeRecentQuestionSummariesV2(value.recentQuestionSummariesV2)
      : normalizeStringArray((value as { recentQuestionSummaries?: unknown }).recentQuestionSummaries, 8).map(
          (summary, index) => ({
            intentKey: `legacy-summary-${index + 1}`,
            normalizedSummary: summary,
            topic: null,
            followupStyle: null,
            turnId: null,
          }),
        );

  return {
    turnCount:
      typeof raw.turnCount === "number" && Number.isFinite(raw.turnCount) && raw.turnCount >= 0
        ? Math.floor(raw.turnCount)
        : typeof raw.questionCount === "number" && Number.isFinite(raw.questionCount) && raw.questionCount >= 0
          ? Math.floor(raw.questionCount)
        : 0,
    currentTopic: normalizeOptionalString(raw.currentTopic ?? raw.currentStage),
    coverageState,
    coveredTopics,
    remainingTopics: normalizeStringArray(value.remainingTopics),
    recentQuestionSummariesV2,
    formatPhase: normalizeFormatPhase(value.formatPhase),
    lastQuestion: normalizeOptionalString(value.lastQuestion),
    lastAnswer: normalizeOptionalString(value.lastAnswer),
    lastTopic: normalizeOptionalString(value.lastTopic),
    currentTurnMeta,
    nextAction: value.nextAction === "feedback" ? "feedback" : "ask",
  };
}

export function getInterviewStageStatus(input: {
  currentTopicLabel?: string | null;
  coveredTopics?: string[];
  remainingTopics?: string[];
}): InterviewStageStatus {
  return {
    currentTopicLabel: normalizeOptionalString(input.currentTopicLabel),
    coveredTopics: normalizeStringArray(input.coveredTopics),
    remainingTopics: normalizeStringArray(input.remainingTopics),
  };
}

export function getInterviewTrackerStatus(input: {
  turnCount: number;
  currentTopicLabel: string | null;
  remainingTopicCount: number;
}) {
  return {
    headline: `${Math.max(0, Math.floor(input.turnCount))}問`,
    detail: `現在: ${input.currentTopicLabel || "初回質問"} / 残り論点 ${Math.max(0, Math.floor(input.remainingTopicCount))}件`,
  };
}

export function getCurrentStageQuestionCount() {
  return 0;
}

export function shouldChargeInterviewSession(isCompleted: boolean): boolean {
  return isCompleted;
}
