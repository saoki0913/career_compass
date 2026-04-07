export type BuildElement = "overview" | "context" | "task" | "action" | "result" | "learning";
export type InputRichnessMode = "seed_only" | "rough_episode" | "almost_draftable";
export type DeepDiveFocus =
  | "role"
  | "challenge"
  | "action_reason"
  | "result_evidence"
  | "learning_transfer"
  | "credibility"
  | "future"
  | "backstory";
export type FocusKey = BuildElement | DeepDiveFocus;
export type ConversationStage = "es_building" | "draft_ready" | "deep_dive_active" | "interview_ready";
export type GakuchikaNextAction =
  | "ask"
  | "show_generate_draft_cta"
  | "continue_deep_dive"
  | "show_interview_ready";

export interface DraftQualityChecks {
  task_clarity?: boolean;
  action_ownership?: boolean;
  role_required?: boolean;
  role_clarity?: boolean;
  result_traceability?: boolean;
  learning_reusability?: boolean;
}

export interface ConversationState {
  stage: ConversationStage;
  focusKey: FocusKey | null;
  progressLabel: string | null;
  answerHint: string | null;
  inputRichnessMode: InputRichnessMode | null;
  missingElements: BuildElement[];
  draftQualityChecks: DraftQualityChecks;
  causalGaps: string[];
  completionChecks: Record<string, boolean>;
  readyForDraft: boolean;
  draftReadinessReason: string;
  draftText: string | null;
  strengthTags: string[];
  issueTags: string[];
  deepdiveRecommendationTags: string[];
  credibilityRiskTags: string[];
  deepdiveStage: string | null;
  deepdiveComplete: boolean;
  completionReasons: string[];
  askedFocuses: FocusKey[];
  resolvedFocuses: FocusKey[];
  deferredFocuses: FocusKey[];
  blockedFocuses: FocusKey[];
  focusAttemptCounts: Partial<Record<FocusKey, number>>;
  lastQuestionSignature: string | null;
  /** 面接準備完了後の「もっと深掘る」回数（サーバー・FastAPI と同期） */
  extendedDeepDiveRound: number;
}

export const BUILD_TRACK_KEYS: Array<Extract<BuildElement, "context" | "task" | "action" | "result">> = [
  "context",
  "task",
  "action",
  "result",
];

export const BUILD_TRACK_LABELS: Record<(typeof BUILD_TRACK_KEYS)[number], string> = {
  context: "状況",
  task: "課題",
  action: "行動",
  result: "結果",
};

export function getDefaultConversationState(): ConversationState {
  return {
    stage: "es_building",
    focusKey: null,
    progressLabel: null,
    answerHint: null,
    inputRichnessMode: null,
    missingElements: ["context", "task", "action", "result"],
    draftQualityChecks: {},
    causalGaps: [],
    completionChecks: {},
    readyForDraft: false,
    draftReadinessReason: "",
    draftText: null,
    strengthTags: [],
    issueTags: [],
    deepdiveRecommendationTags: [],
    credibilityRiskTags: [],
    deepdiveStage: null,
    deepdiveComplete: false,
    completionReasons: [],
    askedFocuses: [],
    resolvedFocuses: [],
    deferredFocuses: [],
    blockedFocuses: [],
    focusAttemptCounts: {},
    lastQuestionSignature: null,
    extendedDeepDiveRound: 0,
  };
}

export function isDraftReady(state: ConversationState | null | undefined): boolean {
  if (!state) return false;
  return state.readyForDraft || ["draft_ready", "deep_dive_active", "interview_ready"].includes(state.stage);
}

export function isInterviewReady(state: ConversationState | null | undefined): boolean {
  return state?.stage === "interview_ready";
}

export function hasDraftText(state: ConversationState | null | undefined): boolean {
  return Boolean(state?.draftText);
}

export function getGakuchikaNextAction(
  state: ConversationState | null | undefined,
): GakuchikaNextAction {
  if (!state) return "ask";
  if (state.stage === "interview_ready") return "show_interview_ready";
  if (state.stage === "draft_ready") {
    return state.draftText ? "continue_deep_dive" : "show_generate_draft_cta";
  }
  return "ask";
}

export function getBuildItemStatus(
  state: ConversationState | null | undefined,
  key: (typeof BUILD_TRACK_KEYS)[number],
): "pending" | "current" | "done" {
  if (!state) return "pending";
  if (state.stage !== "es_building" && isDraftReady(state)) {
    return "done";
  }
  // ES 材料フェーズで missing が空なのにまだ es_building のとき、サーバーは「揃った」とみなすが
  // ユーザーは直近の AI 質問に未回答のことがある。全面「完了」にしない。
  if (state.stage === "es_building" && state.missingElements.length === 0) {
    const fk = state.focusKey;
    if (fk && (BUILD_TRACK_KEYS as readonly string[]).includes(fk)) {
      if (key === fk) return "current";
      return "done";
    }
    // focusKey が無い間（送信中の一瞬など）は誤って「状況まで完了」と出さない
    return "pending";
  }
  if (!state.missingElements.includes(key)) {
    return "done";
  }
  if (state.focusKey === key) {
    return "current";
  }
  const fk = state.focusKey;
  const focusIsStar = fk !== null && (BUILD_TRACK_KEYS as readonly string[]).includes(fk);
  if (!focusIsStar) {
    const firstMissing = BUILD_TRACK_KEYS.find((k) => state.missingElements.includes(k));
    if (firstMissing === key) {
      return "current";
    }
  }
  return "pending";
}

export function getLifecycleItemStatus(
  state: ConversationState | null | undefined,
  step: "draft_ready" | "deep_dive_active" | "interview_ready",
): "pending" | "current" | "done" {
  if (!state) return step === "draft_ready" ? "pending" : "pending";
  if (step === "draft_ready") {
    if (state.stage === "interview_ready" || state.stage === "deep_dive_active") return "done";
    if (state.stage === "draft_ready") return "current";
    return "pending";
  }
  if (step === "deep_dive_active") {
    if (state.stage === "interview_ready") return "done";
    if (state.stage === "deep_dive_active") return "current";
    return "pending";
  }
  return state.stage === "interview_ready" ? "current" : "pending";
}

export function getConversationBadgeLabel(
  status: "in_progress" | "completed" | null,
  state: ConversationState | null | undefined,
): string {
  if (!status) return "未開始";
  if (!state) return status === "completed" ? "完了" : "作成中";
  if (state.stage === "interview_ready") return "面接準備完了";
  if (state.stage === "deep_dive_active") return "深掘り中";
  if (state.stage === "draft_ready") return "ES作成可";
  return "作成中";
}
