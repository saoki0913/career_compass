export const DEFAULT_INTERVIEW_QUESTION_COUNT = 5;

export const INTERVIEW_STAGE_ORDER = [
  "opening",
  "company_understanding",
  "experience",
  "motivation_fit",
  "feedback",
] as const;

export type InterviewStage = (typeof INTERVIEW_STAGE_ORDER)[number];

export type InterviewStageStatus = {
  current: InterviewStage;
  completed: InterviewStage[];
  pending: InterviewStage[];
};

export function getInterviewQuestionStage(questionCount: number): InterviewStage {
  if (questionCount <= 1) {
    return "opening";
  }
  if (questionCount === 2) {
    return "company_understanding";
  }
  if (questionCount === 3) {
    return "experience";
  }
  if (questionCount <= DEFAULT_INTERVIEW_QUESTION_COUNT) {
    return "motivation_fit";
  }
  return "feedback";
}

export function getInterviewStageStatus(
  questionCount: number,
  isCompleted: boolean,
): InterviewStageStatus {
  const current = isCompleted
    ? "feedback"
    : getInterviewQuestionStage(questionCount);
  const currentIndex = INTERVIEW_STAGE_ORDER.indexOf(current);

  return {
    current,
    completed: INTERVIEW_STAGE_ORDER.slice(0, currentIndex),
    pending: INTERVIEW_STAGE_ORDER.slice(currentIndex + 1),
  };
}

export function shouldChargeInterviewSession(isCompleted: boolean): boolean {
  return isCompleted;
}
