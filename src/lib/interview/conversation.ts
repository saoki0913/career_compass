import { type SQL } from "drizzle-orm";

import { db } from "@/lib/db";
import { interviewConversations, interviewFeedbackHistories } from "@/lib/db/schema";
import {
  createInitialInterviewTurnState,
  INTERVIEW_STAGE_ORDER,
  normalizeInterviewTurnState,
  type InterviewQuestionStage,
  type InterviewTurnState,
} from "@/lib/interview/session";

export type InterviewMessage = {
  role: "user" | "assistant";
  content: string;
};

export type InterviewFeedback = {
  overall_comment: string;
  scores: {
    company_fit?: number;
    specificity?: number;
    logic?: number;
    persuasiveness?: number;
  };
  strengths: string[];
  improvements: string[];
  improved_answer: string;
  preparation_points: string[];
  premise_consistency?: number;
};

function parseStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
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
      overall_comment:
        typeof parsed.overall_comment === "string" ? parsed.overall_comment : "",
      scores: parsed.scores ?? {},
      strengths: parseStringArray(parsed.strengths),
      improvements: parseStringArray(parsed.improvements),
      improved_answer:
        typeof parsed.improved_answer === "string" ? parsed.improved_answer : "",
      preparation_points: parseStringArray(parsed.preparation_points),
      premise_consistency:
        typeof parsed.premise_consistency === "number" ? parsed.premise_consistency : undefined,
    };
  } catch {
    return null;
  }
}

export function hydrateInterviewTurnStateFromRow(
  row:
    | {
        currentStage?: string | null;
        questionCount?: number | null;
        stageQuestionCounts?: string | null;
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

  let stageQuestionCounts: InterviewTurnState["stageQuestionCounts"] | undefined;
  let completedStages: InterviewQuestionStage[] | undefined;

  try {
    stageQuestionCounts = JSON.parse(row.stageQuestionCounts || "{}");
  } catch {
    stageQuestionCounts = undefined;
  }

  try {
    completedStages = JSON.parse(row.completedStages || "[]");
  } catch {
    completedStages = undefined;
  }

  return normalizeInterviewTurnState({
    currentStage: INTERVIEW_STAGE_ORDER.includes(
      row.currentStage as InterviewTurnState["currentStage"],
    )
      ? (row.currentStage as InterviewTurnState["currentStage"])
      : undefined,
    totalQuestionCount: row.questionCount ?? undefined,
    stageQuestionCounts,
    completedStages,
    lastQuestionFocus: row.lastQuestionFocus ?? undefined,
    nextAction: row.questionFlowCompleted ? "feedback" : "ask",
  });
}

export function serializeInterviewTurnState(turnState: InterviewTurnState) {
  return {
    currentStage: turnState.currentStage,
    questionCount: turnState.totalQuestionCount,
    stageQuestionCounts: JSON.stringify(turnState.stageQuestionCounts),
    completedStages: JSON.stringify(turnState.completedStages),
    lastQuestionFocus: turnState.lastQuestionFocus,
    questionFlowCompleted:
      turnState.nextAction === "feedback" || turnState.currentStage === "feedback",
  };
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
