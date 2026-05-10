import type { Feedback } from "@/lib/interview/ui";
import type { InterviewStageStatus } from "@/lib/interview/session";
import {
  buildInterviewTopicStages,
  buildInterviewPhases,
  buildInterviewQuestionDisplay,
  buildInterviewCoachingNarrative,
  type TopicStage,
  type LifecyclePhase,
} from "@/lib/interview/ui";

// ---------------------------------------------------------------------------
// Input: subset of controller state consumed by business derivations
// ---------------------------------------------------------------------------

export interface InterviewViewModelInput {
  companyId: string | string[] | undefined;
  feedback: Feedback | null;
  stageStatus: InterviewStageStatus | null;
  questionCount: number;
  questionFlowCompleted: boolean;
  hasStarted: boolean;
}

// ---------------------------------------------------------------------------
// Output: derived business state
// ---------------------------------------------------------------------------

export interface InterviewViewModel {
  /** Normalized companyId (null if the URL param is empty/invalid) */
  normalizedCompanyId: string | null;
  /** The weakest scoring axis from the feedback, for the drill panel */
  weakestAxis: keyof Feedback["scores"] | null;
  /** Topic progress stages for ConversationProgressBar */
  topicStages: TopicStage[];
  /** Interview lifecycle phases for ConversationPhaseBar */
  interviewPhases: LifecyclePhase[];
  /** Formatted question count display string */
  questionDisplay: string;
  /** Coaching narrative for the progress footer */
  coachingNarrative: string | null;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useInterviewViewModel(input: InterviewViewModelInput): InterviewViewModel {
  const { companyId, feedback, stageStatus, questionCount, questionFlowCompleted, hasStarted } = input;

  const normalizedCompanyId = normalizeInterviewCompanyId(companyId);
  const weakestAxis = feedback ? deriveInterviewWeakestAxis(feedback.scores) : null;
  const topicStages = buildInterviewTopicStages(stageStatus, questionFlowCompleted);
  const interviewPhases = buildInterviewPhases(hasStarted, questionFlowCompleted, !!feedback);
  const questionDisplay = buildInterviewQuestionDisplay(questionCount, stageStatus);
  const coachingNarrative = buildInterviewCoachingNarrative(stageStatus, questionCount);

  return {
    normalizedCompanyId,
    weakestAxis,
    topicStages,
    interviewPhases,
    questionDisplay,
    coachingNarrative,
  };
}

// ---------------------------------------------------------------------------
// Pure helpers (testable without React)
// ---------------------------------------------------------------------------

/**
 * Avoid `/api/companies//...` which redirects to `/api/companies/...` and
 * returns HTML 404 (no `[id]` route).
 */
export function normalizeInterviewCompanyId(value: string | string[] | undefined): string | null {
  if (value === undefined) return null;
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function deriveInterviewWeakestAxis(scores: Feedback["scores"]): keyof Feedback["scores"] | null {
  let weakest: keyof Feedback["scores"] | null = null;
  let lowest = Infinity;
  for (const [key, value] of Object.entries(scores)) {
    if (typeof value === "number" && value < lowest) {
      lowest = value;
      weakest = key as keyof Feedback["scores"];
    }
  }
  return weakest;
}
