import { type SQL } from "drizzle-orm";

import { db } from "@/lib/db";
import { interviewConversations, interviewFeedbackHistories } from "@/lib/db/schema";
import {
  createInitialInterviewTurnState,
  normalizeInterviewTurnMeta,
  normalizeInterviewTurnState,
  type InterviewTurnMeta,
  type InterviewTurnState,
} from "@/lib/interview/session";

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
};

function parseStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
}

function parseOptionalString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function parseTurnMeta(value: unknown): InterviewTurnMeta | null {
  if (!value || typeof value !== "object") return null;
  return normalizeInterviewTurnMeta(value as Partial<InterviewTurnMeta>);
}

export function safeParseInterviewMessages(json: string | null | undefined): InterviewMessage[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
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
  } catch {
    return [];
  }
}

export function safeParseInterviewFeedback(json: string | null | undefined): InterviewFeedback | null {
  if (!json) return null;
  try {
    const parsed = JSON.parse(json) as Partial<InterviewFeedback>;
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
      satisfaction_score:
        typeof parsed.satisfaction_score === "number" ? parsed.satisfaction_score : undefined,
    };
  } catch {
    return null;
  }
}

export function hydrateInterviewTurnStateFromRow(
  row:
    | {
        turnStateJson?: string | null;
        currentStage?: string | null;
        questionCount?: number | null;
        completedStages?: string | null;
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
    try {
      return normalizeInterviewTurnState(JSON.parse(row.turnStateJson));
    } catch {
      return createInitialInterviewTurnState();
    }
  }

  let coveredTopics: string[] | undefined;
  try {
    coveredTopics = JSON.parse(row.completedStages || "[]");
  } catch {
    coveredTopics = undefined;
  }

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
    currentStage: turnState.currentTopic,
    questionCount: turnState.turnCount,
    completedStages: JSON.stringify(turnState.coveredTopics),
    lastQuestionFocus: turnState.currentTurnMeta?.topic ?? turnState.currentTopic,
    questionFlowCompleted: turnState.nextAction === "feedback",
    turnStateJson: JSON.stringify(turnState),
  };
}

export function parseInterviewTurnMeta(json: string | null | undefined): InterviewTurnMeta | null {
  if (!json) return null;
  try {
    return parseTurnMeta(JSON.parse(json));
  } catch {
    return null;
  }
}

export async function getInterviewConversationByCondition(whereClause: SQL<unknown> | undefined) {
  const [row] = await db
    .select()
    .from(interviewConversations)
    .where(whereClause)
    .limit(1);
  return row ?? null;
}

export async function getInterviewFeedbackHistoryByCondition(
  whereClause: SQL<unknown> | undefined,
) {
  return db
    .select()
    .from(interviewFeedbackHistories)
    .where(whereClause);
}
