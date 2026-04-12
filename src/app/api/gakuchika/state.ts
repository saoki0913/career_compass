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
  extendedDeepDiveRound: number;
}

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

function isBuildElement(value: string): value is BuildElement {
  return BUILD_ELEMENTS.includes(value as BuildElement);
}

export function isFocusKey(value: string): value is FocusKey {
  return FOCUS_KEYS.has(value as FocusKey);
}

export function defaultConversationState(): ConversationState {
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

function normalizeString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function normalizeMissingElements(value: unknown): BuildElement[] {
  if (!Array.isArray(value)) return [];
  const normalized: BuildElement[] = [];
  for (const item of value) {
    if (typeof item === "string" && isBuildElement(item) && !normalized.includes(item)) {
      normalized.push(item);
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
  return {
    task_clarity: typeof record.task_clarity === "boolean" ? record.task_clarity : undefined,
    action_ownership: typeof record.action_ownership === "boolean" ? record.action_ownership : undefined,
    role_required: typeof record.role_required === "boolean" ? record.role_required : undefined,
    role_clarity: typeof record.role_clarity === "boolean" ? record.role_clarity : undefined,
    result_traceability: typeof record.result_traceability === "boolean" ? record.result_traceability : undefined,
    learning_reusability:
      typeof record.learning_reusability === "boolean" ? record.learning_reusability : undefined,
  };
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

export function safeParseMessages(json: string): Message[] {
  try {
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) {
      return [];
    }

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
    focusAttemptCounts: {},
    lastQuestionSignature: null,
    extendedDeepDiveRound: 0,
  };
}

export function safeParseConversationState(json: string | null, status?: string | null): ConversationState {
  if (!json) {
    return status === "completed"
      ? {
          ...defaultConversationState(),
          stage: "draft_ready",
          readyForDraft: true,
          progressLabel: "ES作成可",
          resolvedFocuses: ["context", "task", "action", "result"],
          deferredFocuses: ["learning"],
        }
      : defaultConversationState();
  }

  try {
    const parsed = JSON.parse(json) as Record<string, unknown>;
    const legacy = parseLegacyState(parsed, status);
    if (legacy) return legacy;

    const stage = normalizeString(parsed.stage) as ConversationStage | null;
    const focusKeyRaw = normalizeString(parsed.focus_key ?? parsed.focusKey);
    const focusKey = focusKeyRaw && isFocusKey(focusKeyRaw) ? focusKeyRaw : null;

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
      draftText: normalizeString(parsed.draft_text ?? parsed.draftText),
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
      focusAttemptCounts: normalizeFocusAttemptCounts(parsed.focus_attempt_counts ?? parsed.focusAttemptCounts),
      lastQuestionSignature: normalizeString(parsed.last_question_signature ?? parsed.lastQuestionSignature),
      extendedDeepDiveRound: normalizeExtendedDeepDiveRound(
        parsed.extended_deep_dive_round ?? parsed.extendedDeepDiveRound,
      ),
    };
  } catch {
    return defaultConversationState();
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
    focus_attempt_counts: state.focusAttemptCounts,
    last_question_signature: state.lastQuestionSignature,
    extended_deep_dive_round: state.extendedDeepDiveRound,
  });
}

export function isDraftReady(state: ConversationState | null): boolean {
  if (!state) return false;
  return state.readyForDraft || ["draft_ready", "deep_dive_active", "interview_ready"].includes(state.stage);
}

export function isInterviewReady(state: ConversationState | null): boolean {
  if (!state) return false;
  return state.stage === "interview_ready";
}

export function getGakuchikaNextAction(state: ConversationState | null): GakuchikaNextAction {
  if (!state) return "ask";
  if (state.stage === "interview_ready") return "show_interview_ready";
  if (state.stage === "draft_ready") {
    return state.draftText ? "continue_deep_dive" : "show_generate_draft_cta";
  }
  return "ask";
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
    focusAttemptCounts: patch.focusAttemptCounts ?? current.focusAttemptCounts,
    lastQuestionSignature: patch.lastQuestionSignature ?? current.lastQuestionSignature,
    extendedDeepDiveRound: patch.extendedDeepDiveRound ?? current.extendedDeepDiveRound,
  };
}
