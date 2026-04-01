export type BuildElement = "overview" | "context" | "task" | "action" | "result" | "learning";
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

export interface ConversationState {
  stage: ConversationStage;
  focusKey: FocusKey | null;
  progressLabel: string | null;
  answerHint: string | null;
  missingElements: BuildElement[];
  readyForDraft: boolean;
  draftReadinessReason: string;
  draftText: string | null;
  deepdiveStage: string | null;
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
    missingElements: ["context", "task", "action", "result", "learning"],
    readyForDraft: false,
    draftReadinessReason: "",
    draftText: null,
    deepdiveStage: null,
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

export function getBuildItemStatus(
  state: ConversationState | null | undefined,
  key: (typeof BUILD_TRACK_KEYS)[number],
): "pending" | "current" | "done" {
  if (!state) return "pending";
  if (state.stage !== "es_building" && isDraftReady(state)) {
    return "done";
  }
  if (!state.missingElements.includes(key)) {
    return "done";
  }
  if (state.focusKey === key) {
    return "current";
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
