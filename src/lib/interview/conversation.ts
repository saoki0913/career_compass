import {
  createInitialInterviewTurnState,
  normalizeInterviewTurnMeta,
  normalizeInterviewTurnState,
  type InterviewTurnMeta,
  type InterviewTurnState,
} from "@/lib/interview/session";
import { normalizeInterviewPlanValue, type InterviewPlan } from "@/lib/interview/plan";

export type InterviewMessage = {
  role: "user" | "assistant";
  content: string;
};

export type InterviewFeedbackScores = {
  company_fit?: number;
  role_fit?: number;
  specificity?: number;
  logic?: number;
  persuasiveness?: number;
  consistency?: number;
  credibility?: number;
};

export type InterviewFeedbackConfidence = "high" | "medium" | "low";

/**
 * Phase 2 Stage 6: Per-turn short coaching.
 *
 * 直前回答 (lastAnswer) に対する short coaching。turn SSE の `complete` event の
 * `data.short_coaching` として返る。3 フィールドは各 30-60 字、general praise 禁止。
 * 初回ターン (会話履歴が空) は 3 フィールド空文字または null の可能性があり、
 * UI 側は空判定で非表示にする。
 */
export type InterviewShortCoaching = {
  good: string;
  missing: string;
  next_edit: string;
};

export function safeParseInterviewShortCoaching(value: unknown): InterviewShortCoaching | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (
    typeof record.good !== "string" ||
    typeof record.missing !== "string" ||
    typeof record.next_edit !== "string"
  ) {
    return null;
  }
  // 初回ターンの空文字 3 件は UI 非表示のため null に丸める
  if (!record.good.trim() && !record.missing.trim() && !record.next_edit.trim()) {
    return null;
  }
  return {
    good: record.good,
    missing: record.missing,
    next_edit: record.next_edit,
  };
}

export type InterviewFeedback = {
  overall_comment: string;
  scores: InterviewFeedbackScores;
  strengths: string[];
  improvements: string[];
  consistency_risks: string[];
  weakest_question_type?: string | null;
  weakest_turn_id?: string | null;
  weakest_question_snapshot?: string | null;
  weakest_answer_snapshot?: string | null;
  improved_answer: string;
  next_preparation: string[];
  premise_consistency?: number;
  satisfaction_score?: number;
  // Phase 2 Stage 5: Evidence-Linked Rubric
  score_evidence_by_axis?: Record<string, string[]>;
  score_rationale_by_axis?: Record<string, string>;
  confidence_by_axis?: Record<string, InterviewFeedbackConfidence>;
};

function parseStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
}

function parseOptionalString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function safeParseJsonValue(value: unknown): unknown {
  if (value == null) return null;
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }
  return value;
}

export function safeParseStringArrayJson(value: unknown): string[] {
  return parseStringArray(safeParseJsonValue(value));
}

function parseTurnMeta(value: unknown): InterviewTurnMeta | null {
  if (!value || typeof value !== "object") return null;
  return normalizeInterviewTurnMeta(value as Partial<InterviewTurnMeta>);
}

export function safeParseInterviewMessages(value: unknown): InterviewMessage[] {
  const parsed = safeParseJsonValue(value);
  if (!Array.isArray(parsed)) return [];
  return parsed
    .filter(
      (message): message is InterviewMessage =>
        !!message &&
        typeof message === "object" &&
        ((message as { role?: string }).role === "user" ||
          (message as { role?: string }).role === "assistant") &&
        typeof (message as { content?: unknown }).content === "string",
    )
    .map((message) => ({
      role: message.role,
      content: message.content.trim(),
    }))
    .filter((message) => message.content.length > 0);
}

function parseEvidenceMap(value: unknown): Record<string, string[]> | undefined {
  if (!value || typeof value !== "object") return undefined;
  const result: Record<string, string[]> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    if (Array.isArray(val)) {
      result[key] = parseStringArray(val);
    }
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

function parseRationaleMap(value: unknown): Record<string, string> | undefined {
  if (!value || typeof value !== "object") return undefined;
  const result: Record<string, string> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    if (typeof val === "string" && val.trim().length > 0) {
      result[key] = val.trim();
    }
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

function parseConfidenceMap(value: unknown): Record<string, InterviewFeedbackConfidence> | undefined {
  if (!value || typeof value !== "object") return undefined;
  const result: Record<string, InterviewFeedbackConfidence> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    if (val === "high" || val === "medium" || val === "low") {
      result[key] = val;
    }
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

export function safeParseInterviewFeedback(value: unknown): InterviewFeedback | null {
  const parsed = safeParseJsonValue(value) as Partial<InterviewFeedback> | null;
  if (!parsed || typeof parsed !== "object") return null;
  return {
    overall_comment: typeof parsed.overall_comment === "string" ? parsed.overall_comment : "",
    scores: parsed.scores ?? {},
    strengths: parseStringArray(parsed.strengths),
    improvements: parseStringArray(parsed.improvements),
    consistency_risks: parseStringArray(parsed.consistency_risks),
    weakest_question_type: parseOptionalString(parsed.weakest_question_type),
    weakest_turn_id: parseOptionalString(parsed.weakest_turn_id),
    weakest_question_snapshot: parseOptionalString(parsed.weakest_question_snapshot),
    weakest_answer_snapshot: parseOptionalString(parsed.weakest_answer_snapshot),
    improved_answer: typeof parsed.improved_answer === "string" ? parsed.improved_answer : "",
    next_preparation: parseStringArray(parsed.next_preparation),
    premise_consistency:
      typeof parsed.premise_consistency === "number" ? parsed.premise_consistency : undefined,
    satisfaction_score: typeof parsed.satisfaction_score === "number" ? parsed.satisfaction_score : undefined,
    score_evidence_by_axis: parseEvidenceMap(parsed.score_evidence_by_axis),
    score_rationale_by_axis: parseRationaleMap(parsed.score_rationale_by_axis),
    confidence_by_axis: parseConfidenceMap(parsed.confidence_by_axis),
  };
}

export function hydrateInterviewTurnStateFromRow(
  row:
    | {
        turnStateJson?: unknown;
        currentStage?: string | null;
        questionCount?: number | null;
        completedStages?: unknown;
        lastQuestionFocus?: string | null;
        questionFlowCompleted?: boolean | null;
      }
    | null
    | undefined,
): InterviewTurnState {
  if (!row) {
    return createInitialInterviewTurnState();
  }

  if (row.turnStateJson) {
    const parsed = safeParseJsonValue(row.turnStateJson);
    if (parsed) {
      return normalizeInterviewTurnState(parsed);
    }
    return createInitialInterviewTurnState();
  }

  const coveredTopics = safeParseStringArrayJson(row.completedStages);

  return normalizeInterviewTurnState({
    turnCount: row.questionCount ?? 0,
    currentTopic: row.currentStage ?? null,
    coverageState: [],
    coveredTopics,
    remainingTopics: [],
    recentQuestionSummariesV2: [],
    formatPhase: "opening",
    lastQuestion: null,
    lastAnswer: null,
    lastTopic: row.lastQuestionFocus ?? null,
    currentTurnMeta: row.lastQuestionFocus
      ? {
          topic: row.currentStage ?? null,
          turnAction: "deepen",
          focusReason: null,
          depthFocus: null,
          followupStyle: null,
          shouldMoveNext: false,
          interviewSetupNote: null,
          intentKey: null,
          formatGuardApplied: null,
          coverageDecision: null,
          checklistDelta: null,
        }
      : null,
    nextAction: row.questionFlowCompleted ? "feedback" : "ask",
  });
}

export function serializeInterviewTurnState(turnState: InterviewTurnState) {
  return {
    currentStage: turnState.currentTopic ?? "opening",
    questionCount: turnState.turnCount,
    completedStages: turnState.coveredTopics,
    lastQuestionFocus: turnState.currentTurnMeta?.topic ?? turnState.currentTopic,
    questionFlowCompleted: turnState.nextAction === "feedback",
    turnStateJson: turnState,
  };
}

export function parseInterviewTurnMeta(value: unknown): InterviewTurnMeta | null {
  return parseTurnMeta(safeParseJsonValue(value));
}

export function parseInterviewPlanJson(value: unknown): InterviewPlan | null {
  const parsed = safeParseJsonValue(value);
  return parsed ? normalizeInterviewPlanValue(parsed) : null;
}

export function serializeInterviewMessages(messages: InterviewMessage[]): InterviewMessage[] {
  return messages;
}

export function serializeInterviewPlan(plan: InterviewPlan | null | undefined): InterviewPlan | null | undefined {
  return plan ?? null;
}

export function serializeInterviewTurnMeta(turnMeta: InterviewTurnMeta | null | undefined): InterviewTurnMeta | null {
  return turnMeta ?? null;
}

export function serializeInterviewFeedback(feedback: InterviewFeedback | null | undefined): InterviewFeedback | null {
  return feedback ?? null;
}

