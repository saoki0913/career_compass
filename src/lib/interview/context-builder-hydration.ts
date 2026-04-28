import {
  getInterviewStageStatus,
  INTERVIEW_STAGE_OPTIONS,
  INTERVIEWER_TYPE_OPTIONS,
  ROLE_TRACK_OPTIONS,
  SELECTION_TYPE_OPTIONS,
  STRICTNESS_MODE_OPTIONS,
} from "@/lib/interview/session";
import {
  hydrateInterviewTurnStateFromRow,
  parseInterviewPlanJson,
  parseInterviewTurnMeta,
  safeParseInterviewFeedback,
  safeParseInterviewMessages,
} from "@/lib/interview/conversation";
import { interviewConversations, interviewFeedbackHistories } from "@/lib/db/schema";
import {
  parseFeedbackScores,
  parseJsonArray,
} from "@/lib/interview/read-model";
import { canonicalizeInterviewFormat } from "@/lib/interview/session";
import { isLegacyInterviewConversation, parseEnumValue } from "@/lib/interview/context-builder-setup";
import type {
  HydratedInterviewConversation,
  InterviewFeedbackHistoryItem,
  InterviewSetupState,
} from "@/lib/interview/types";

function parseStringArrayMap(value: unknown): Record<string, string[]> {
  if (!value || typeof value !== "object") return {};
  const result: Record<string, string[]> = {};
  for (const [key, rawItems] of Object.entries(value as Record<string, unknown>)) {
    if (!Array.isArray(rawItems)) continue;
    const items = rawItems.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
    if (items.length > 0) result[key] = items;
  }
  return result;
}

function parseStringMap(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object") return {};
  const result: Record<string, string> = {};
  for (const [key, rawValue] of Object.entries(value as Record<string, unknown>)) {
    if (typeof rawValue === "string" && rawValue.trim().length > 0) {
      result[key] = rawValue.trim();
    }
  }
  return result;
}

export function toFeedbackHistoryItem(
  row: typeof interviewFeedbackHistories.$inferSelect,
): InterviewFeedbackHistoryItem {
  return {
    id: row.id,
    overallComment: row.overallComment,
    scores: parseFeedbackScores(row.scores),
    strengths: parseJsonArray(row.strengths),
    improvements: parseJsonArray(row.improvements),
    consistencyRisks: parseJsonArray(row.consistencyRisks),
    weakestQuestionType: row.weakestQuestionType ?? null,
    weakestTurnId: row.weakestTurnId ?? null,
    weakestQuestionSnapshot: row.weakestQuestionSnapshot ?? null,
    weakestAnswerSnapshot: row.weakestAnswerSnapshot ?? null,
    improvedAnswer: row.improvedAnswer,
    nextPreparation: parseJsonArray(row.preparationPoints),
    premiseConsistency: row.premiseConsistency,
    satisfactionScore: row.satisfactionScore ?? null,
    scoreEvidenceByAxis: parseStringArrayMap(row.scoreEvidenceByAxis),
    scoreRationaleByAxis: parseStringMap(row.scoreRationaleByAxis),
    confidenceByAxis: parseStringMap(row.confidenceByAxis),
    sourceQuestionCount: row.sourceQuestionCount,
    createdAt: row.createdAt.toISOString(),
  };
}

export function hydrateInterviewConversation(
  activeConversation: typeof interviewConversations.$inferSelect | null,
  setup: InterviewSetupState,
): HydratedInterviewConversation | null {
  if (!activeConversation) return null;

  const turnState = hydrateInterviewTurnStateFromRow(activeConversation);
  const plan = parseInterviewPlanJson(activeConversation.interviewPlanJson);
  const stageStatus = getInterviewStageStatus({
    currentTopicLabel: turnState.currentTopic,
    coveredTopics: turnState.coveredTopics,
    remainingTopics: turnState.remainingTopics,
  });

  return {
    id: activeConversation.id,
    status: activeConversation.status,
    messages: safeParseInterviewMessages(activeConversation.messages),
    turnState,
    turnMeta: parseInterviewTurnMeta(activeConversation.turnMetaJson),
    plan,
    stageStatus,
    questionCount: activeConversation.questionCount ?? turnState.turnCount,
    questionFlowCompleted: Boolean(activeConversation.questionFlowCompleted),
    feedback: safeParseInterviewFeedback(activeConversation.activeFeedbackDraft),
    selectedIndustry: activeConversation.selectedIndustry,
    selectedRole: activeConversation.selectedRole,
    selectedRoleSource: activeConversation.selectedRoleSource,
    roleTrack: parseEnumValue(activeConversation.roleTrack, ROLE_TRACK_OPTIONS, setup.roleTrack),
    interviewFormat: canonicalizeInterviewFormat(activeConversation.interviewFormat ?? setup.interviewFormat),
    selectionType: parseEnumValue(activeConversation.selectionType, SELECTION_TYPE_OPTIONS, setup.selectionType),
    interviewStage: parseEnumValue(activeConversation.interviewStage, INTERVIEW_STAGE_OPTIONS, setup.interviewStage),
    interviewerType: parseEnumValue(
      activeConversation.interviewerType,
      INTERVIEWER_TYPE_OPTIONS,
      setup.interviewerType,
    ),
    strictnessMode: parseEnumValue(activeConversation.strictnessMode, STRICTNESS_MODE_OPTIONS, setup.strictnessMode),
    isLegacySession: isLegacyInterviewConversation(activeConversation),
  };
}
