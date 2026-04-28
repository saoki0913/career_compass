export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

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

const BUILD_ELEMENTS: BuildElement[] = ["overview", "context", "task", "action", "result", "learning"];
const FOCUS_KEYS = new Set<FocusKey>([
  "overview",
  "context",
  "task",
  "action",
  "result",
  "learning",
  "role",
  "challenge",
  "action_reason",
  "result_evidence",
  "learning_transfer",
  "credibility",
  "future",
  "backstory",
]);

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
  draftDocumentId: string | null;
  summaryStale: boolean;
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
  recentQuestionTexts: string[];
  loopBlockedFocuses: FocusKey[];
  focusAttemptCounts: Partial<Record<FocusKey, number>>;
  lastQuestionSignature: string | null;
  /** 面接準備完了後の「もっと深掘る」回数（サーバー・FastAPI と同期） */
  extendedDeepDiveRound: number;
  /** サーバーサイドで計算されたコーチ進捗メッセージ (NaturalProgressStatus で表示) */
  coachProgressMessage: string | null;
  /**
   * サーバー側 readiness gate と整合した残り質問数推定 (int ≥ 0)。
   * `null` は古い resume payload（新キー未搭載）のフォールバック用。
   * 値がある場合、UI は `missingElements.length` などの client heuristic より優先する。
   */
  remainingQuestionsEstimate: number | null;
  /**
   * draft_ready / interview_ready で入力を一時停止しても、LLM が返した
   * 次の深掘り質問を会話内に残すための表示用テキスト。
   */
  pausedQuestion: string | null;
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

export function isFocusKey(value: string): value is FocusKey {
  return FOCUS_KEYS.has(value as FocusKey);
}

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
    draftDocumentId: null,
    summaryStale: false,
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
    recentQuestionTexts: [],
    loopBlockedFocuses: [],
    focusAttemptCounts: {},
    lastQuestionSignature: null,
    extendedDeepDiveRound: 0,
    coachProgressMessage: null,
    remainingQuestionsEstimate: null,
    pausedQuestion: null,
  };
}

export const defaultConversationState = getDefaultConversationState;

function normalizeString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function normalizeMissingElements(value: unknown): BuildElement[] {
  if (!Array.isArray(value)) return [];
  const normalized: BuildElement[] = [];
  for (const item of value) {
    if (typeof item === "string" && BUILD_ELEMENTS.includes(item as BuildElement) && !normalized.includes(item as BuildElement)) {
      normalized.push(item as BuildElement);
    }
  }
  return normalized;
}

function normalizeInputRichnessMode(value: unknown): InputRichnessMode | null {
  return value === "seed_only" || value === "rough_episode" || value === "almost_draftable"
    ? value
    : null;
}

function normalizeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
}

function normalizeDraftQualityChecks(value: unknown): DraftQualityChecks {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const record = value as Record<string, unknown>;
  const checks: DraftQualityChecks = {};
  if (typeof record.task_clarity === "boolean") checks.task_clarity = record.task_clarity;
  if (typeof record.action_ownership === "boolean") checks.action_ownership = record.action_ownership;
  if (typeof record.role_required === "boolean") checks.role_required = record.role_required;
  if (typeof record.role_clarity === "boolean") checks.role_clarity = record.role_clarity;
  if (typeof record.result_traceability === "boolean") checks.result_traceability = record.result_traceability;
  if (typeof record.learning_reusability === "boolean") {
    checks.learning_reusability = record.learning_reusability;
  }
  return checks;
}

function normalizeCompletionChecks(value: unknown): Record<string, boolean> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).filter(([, item]) => typeof item === "boolean"),
  ) as Record<string, boolean>;
}

function normalizeFocusList(value: unknown): FocusKey[] {
  if (!Array.isArray(value)) return [];
  const normalized: FocusKey[] = [];
  for (const item of value) {
    if (typeof item === "string" && isFocusKey(item) && !normalized.includes(item)) {
      normalized.push(item);
    }
  }
  return normalized;
}

function normalizeExtendedDeepDiveRound(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, Math.floor(value)));
}

function normalizeRemainingQuestionsEstimate(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return null;
  return Math.floor(value);
}

function normalizeFocusAttemptCounts(value: unknown): Partial<Record<FocusKey, number>> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const next: Partial<Record<FocusKey, number>> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (!isFocusKey(key)) continue;
    if (typeof item !== "number" || !Number.isFinite(item) || item <= 0) continue;
    next[key] = Math.floor(item);
  }
  return next;
}

function normalizeMessagesFromUnknown(parsed: unknown): Message[] {
  if (!Array.isArray(parsed)) return [];

  return parsed
    .filter((message): message is { id?: string; role: string; content: string } =>
      message &&
      typeof message === "object" &&
      (message.role === "user" || message.role === "assistant") &&
      typeof message.content === "string",
    )
    .map((message) => ({
      id: message.id || crypto.randomUUID(),
      role: message.role as "user" | "assistant",
      content: message.content,
    }));
}

/** Accepts JSON string (legacy rows) or parsed jsonb array from Drizzle. */
export function safeParseMessages(value: string | unknown): Message[] {
  if (Array.isArray(value)) {
    return normalizeMessagesFromUnknown(value);
  }
  if (typeof value !== "string") {
    return [];
  }
  try {
    const parsed = JSON.parse(value);
    return normalizeMessagesFromUnknown(parsed);
  } catch {
    return [];
  }
}

function parseLegacyState(value: Record<string, unknown>, status: string | null | undefined): ConversationState | null {
  const hasLegacyScores = ["situation", "task", "action", "result"].some((key) => typeof value[key] === "number");
  if (!hasLegacyScores) return null;
  return {
    stage: status === "completed" ? "draft_ready" : "es_building",
    focusKey: status === "completed" ? "result" : "task",
    progressLabel: status === "completed" ? "ES作成可" : "作成中",
    answerHint: null,
    inputRichnessMode: null,
    missingElements: [],
    draftQualityChecks: {},
    causalGaps: [],
    completionChecks: {},
    readyForDraft: status === "completed",
    draftReadinessReason: "",
    draftText: null,
    draftDocumentId: null,
    summaryStale: false,
    strengthTags: [],
    issueTags: [],
    deepdiveRecommendationTags: [],
    credibilityRiskTags: [],
    deepdiveStage: null,
    deepdiveComplete: false,
    completionReasons: [],
    askedFocuses: [],
    resolvedFocuses: status === "completed" ? ["context", "task", "action", "result"] : [],
    deferredFocuses: status === "completed" ? ["learning"] : [],
    blockedFocuses: [],
    recentQuestionTexts: [],
    loopBlockedFocuses: [],
    focusAttemptCounts: {},
    lastQuestionSignature: null,
    extendedDeepDiveRound: 0,
    coachProgressMessage: null,
    remainingQuestionsEstimate: status === "completed" ? 0 : null,
    pausedQuestion: null,
  };
}

export function safeParseConversationState(json: string | null, status?: string | null): ConversationState {
  if (!json) {
    return status === "completed"
      ? {
          ...getDefaultConversationState(),
          stage: "draft_ready",
          readyForDraft: true,
          progressLabel: "ES作成可",
          resolvedFocuses: ["context", "task", "action", "result"],
          deferredFocuses: ["learning"],
          remainingQuestionsEstimate: 0,
          pausedQuestion: null,
        }
      : getDefaultConversationState();
  }

  try {
    const parsed = JSON.parse(json) as Record<string, unknown>;
    const legacy = parseLegacyState(parsed, status);
    if (legacy) return legacy;

    const rawStage = normalizeString(parsed.stage) as ConversationStage | null;
    const focusKeyRaw = normalizeString(parsed.focus_key ?? parsed.focusKey);
    const focusKey = focusKeyRaw && isFocusKey(focusKeyRaw) ? focusKeyRaw : null;
    const draftText = normalizeString(parsed.draft_text ?? parsed.draftText);
    const stage =
      rawStage === "interview_ready" && !draftText
        ? "deep_dive_active"
        : rawStage;

    return {
      stage:
        stage === "draft_ready" || stage === "deep_dive_active" || stage === "interview_ready"
          ? stage
          : "es_building",
      focusKey,
      progressLabel: normalizeString(parsed.progress_label ?? parsed.progressLabel),
      answerHint: normalizeString(parsed.answer_hint ?? parsed.answerHint),
      inputRichnessMode: normalizeInputRichnessMode(parsed.input_richness_mode ?? parsed.inputRichnessMode),
      missingElements: normalizeMissingElements(parsed.missing_elements ?? parsed.missingElements),
      draftQualityChecks: normalizeDraftQualityChecks(parsed.draft_quality_checks ?? parsed.draftQualityChecks),
      causalGaps: normalizeStringList(parsed.causal_gaps ?? parsed.causalGaps),
      completionChecks: normalizeCompletionChecks(parsed.completion_checks ?? parsed.completionChecks),
      readyForDraft: Boolean(parsed.ready_for_draft ?? parsed.readyForDraft),
      draftReadinessReason: String(parsed.draft_readiness_reason ?? parsed.draftReadinessReason ?? "").trim(),
      draftText,
      draftDocumentId: normalizeString(parsed.draft_document_id ?? parsed.draftDocumentId),
      summaryStale: Boolean(parsed.summary_stale ?? parsed.summaryStale),
      strengthTags: normalizeStringList(parsed.strength_tags ?? parsed.strengthTags),
      issueTags: normalizeStringList(parsed.issue_tags ?? parsed.issueTags),
      deepdiveRecommendationTags: normalizeStringList(
        parsed.deepdive_recommendation_tags ?? parsed.deepdiveRecommendationTags,
      ),
      credibilityRiskTags: normalizeStringList(parsed.credibility_risk_tags ?? parsed.credibilityRiskTags),
      deepdiveStage: normalizeString(parsed.deepdive_stage ?? parsed.deepdiveStage),
      deepdiveComplete: Boolean(parsed.deepdive_complete ?? parsed.deepdiveComplete),
      completionReasons: normalizeStringList(parsed.completion_reasons ?? parsed.completionReasons),
      askedFocuses: normalizeFocusList(parsed.asked_focuses ?? parsed.askedFocuses),
      resolvedFocuses: normalizeFocusList(parsed.resolved_focuses ?? parsed.resolvedFocuses),
      deferredFocuses: normalizeFocusList(parsed.deferred_focuses ?? parsed.deferredFocuses),
      blockedFocuses: normalizeFocusList(parsed.blocked_focuses ?? parsed.blockedFocuses),
      recentQuestionTexts: normalizeStringList(parsed.recent_question_texts ?? parsed.recentQuestionTexts),
      loopBlockedFocuses: normalizeFocusList(parsed.loop_blocked_focuses ?? parsed.loopBlockedFocuses),
      focusAttemptCounts: normalizeFocusAttemptCounts(parsed.focus_attempt_counts ?? parsed.focusAttemptCounts),
      lastQuestionSignature: normalizeString(parsed.last_question_signature ?? parsed.lastQuestionSignature),
      extendedDeepDiveRound: normalizeExtendedDeepDiveRound(
        parsed.extended_deep_dive_round ?? parsed.extendedDeepDiveRound,
      ),
      coachProgressMessage: normalizeString(parsed.coach_progress_message ?? parsed.coachProgressMessage),
      remainingQuestionsEstimate: normalizeRemainingQuestionsEstimate(
        parsed.remaining_questions_estimate ?? parsed.remainingQuestionsEstimate,
      ),
      pausedQuestion: normalizeString(parsed.paused_question ?? parsed.pausedQuestion),
    };
  } catch {
    return getDefaultConversationState();
  }
}

export function serializeConversationState(state: ConversationState): string {
  return JSON.stringify({
    stage: state.stage,
    focus_key: state.focusKey,
    progress_label: state.progressLabel,
    answer_hint: state.answerHint,
    input_richness_mode: state.inputRichnessMode,
    missing_elements: state.missingElements,
    draft_quality_checks: state.draftQualityChecks,
    causal_gaps: state.causalGaps,
    completion_checks: state.completionChecks,
    ready_for_draft: state.readyForDraft,
    draft_readiness_reason: state.draftReadinessReason,
    draft_text: state.draftText,
    draft_document_id: state.draftDocumentId,
    summary_stale: state.summaryStale,
    strength_tags: state.strengthTags,
    issue_tags: state.issueTags,
    deepdive_recommendation_tags: state.deepdiveRecommendationTags,
    credibility_risk_tags: state.credibilityRiskTags,
    deepdive_stage: state.deepdiveStage,
    deepdive_complete: state.deepdiveComplete,
    completion_reasons: state.completionReasons,
    asked_focuses: state.askedFocuses,
    resolved_focuses: state.resolvedFocuses,
    deferred_focuses: state.deferredFocuses,
    blocked_focuses: state.blockedFocuses,
    recent_question_texts: state.recentQuestionTexts,
    loop_blocked_focuses: state.loopBlockedFocuses,
    focus_attempt_counts: state.focusAttemptCounts,
    last_question_signature: state.lastQuestionSignature,
    extended_deep_dive_round: state.extendedDeepDiveRound,
    coach_progress_message: state.coachProgressMessage,
    remaining_questions_estimate: state.remainingQuestionsEstimate,
    paused_question: state.pausedQuestion,
  });
}

export function buildConversationStatePatch(
  current: ConversationState,
  patch: Partial<ConversationState>,
): ConversationState {
  return {
    ...current,
    ...patch,
    missingElements: patch.missingElements ?? current.missingElements,
    draftQualityChecks: patch.draftQualityChecks ?? current.draftQualityChecks,
    causalGaps: patch.causalGaps ?? current.causalGaps,
    completionChecks: patch.completionChecks ?? current.completionChecks,
    strengthTags: patch.strengthTags ?? current.strengthTags,
    issueTags: patch.issueTags ?? current.issueTags,
    deepdiveRecommendationTags: patch.deepdiveRecommendationTags ?? current.deepdiveRecommendationTags,
    credibilityRiskTags: patch.credibilityRiskTags ?? current.credibilityRiskTags,
    completionReasons: patch.completionReasons ?? current.completionReasons,
    askedFocuses: patch.askedFocuses ?? current.askedFocuses,
    resolvedFocuses: patch.resolvedFocuses ?? current.resolvedFocuses,
    deferredFocuses: patch.deferredFocuses ?? current.deferredFocuses,
    blockedFocuses: patch.blockedFocuses ?? current.blockedFocuses,
    recentQuestionTexts: patch.recentQuestionTexts ?? current.recentQuestionTexts,
    loopBlockedFocuses: patch.loopBlockedFocuses ?? current.loopBlockedFocuses,
    focusAttemptCounts: patch.focusAttemptCounts ?? current.focusAttemptCounts,
    lastQuestionSignature: patch.lastQuestionSignature ?? current.lastQuestionSignature,
    extendedDeepDiveRound: patch.extendedDeepDiveRound ?? current.extendedDeepDiveRound,
    // `coachProgressMessage` is null-late-wins: サーバーが明示的に null を送った時は
    // 古い値を消す必要がある。`??` は `null` も fallback 対象にしてしまうので、
    // `hasOwnProperty` で「patch に key が存在するか」を判定する。
    coachProgressMessage: Object.prototype.hasOwnProperty.call(patch, "coachProgressMessage")
      ? (patch.coachProgressMessage ?? null)
      : current.coachProgressMessage,
    // `remainingQuestionsEstimate` も同じ late-wins。patch に明示的に `null` が
    // 乗っていたら古い値を消し、key が存在しないときは保持する。
    remainingQuestionsEstimate: Object.prototype.hasOwnProperty.call(patch, "remainingQuestionsEstimate")
      ? (patch.remainingQuestionsEstimate ?? null)
      : current.remainingQuestionsEstimate,
    pausedQuestion: Object.prototype.hasOwnProperty.call(patch, "pausedQuestion")
      ? (patch.pausedQuestion ?? null)
      : current.pausedQuestion,
    draftDocumentId: Object.prototype.hasOwnProperty.call(patch, "draftDocumentId")
      ? (patch.draftDocumentId ?? null)
      : current.draftDocumentId,
    summaryStale: Object.prototype.hasOwnProperty.call(patch, "summaryStale")
      ? Boolean(patch.summaryStale)
      : current.summaryStale,
  };
}

export function isDraftReady(state: ConversationState | null | undefined): boolean {
  if (!state) return false;
  return state.readyForDraft || ["draft_ready", "deep_dive_active", "interview_ready"].includes(state.stage);
}

export function isInterviewReady(state: ConversationState | null | undefined): boolean {
  return state?.stage === "interview_ready" && Boolean(state.draftText);
}

export function hasDraftText(state: ConversationState | null | undefined): boolean {
  return Boolean(state?.draftText);
}

export function getGakuchikaNextAction(
  state: ConversationState | null | undefined,
): GakuchikaNextAction {
  if (!state) return "ask";
  if (isInterviewReady(state)) return "show_interview_ready";
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
  const fk = state.focusKey;
  const focusIsStar = fk !== null && (BUILD_TRACK_KEYS as readonly string[]).includes(fk);
  if (focusIsStar) {
    if (key === fk) return "current";
    return state.missingElements.includes(key) ? "pending" : "done";
  }
  // ES 材料フェーズで missing が空なのにまだ es_building のとき、サーバーは「揃った」とみなすが
  // ユーザーは直近の AI 質問に未回答のことがある。全面「完了」にしない。
  if (state.stage === "es_building" && state.missingElements.length === 0) {
    // focusKey が無い間（送信中の一瞬など）は誤って「状況まで完了」と出さない
    return "pending";
  }
  if (!state.missingElements.includes(key)) {
    return "done";
  }
  if (state.focusKey === key) {
    return "current";
  }
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
