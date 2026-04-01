export const DEFAULT_INTERVIEW_QUESTION_COUNT = 10;
export const INTERVIEW_MIN_QUESTION_COUNT = 10;
export const INTERVIEW_MAX_QUESTION_COUNT = 15;

export const INTERVIEW_STAGE_ORDER = [
  "industry_reason",
  "role_reason",
  "opening",
  "experience",
  "company_understanding",
  "motivation_fit",
  "feedback",
] as const;

export type InterviewStage = (typeof INTERVIEW_STAGE_ORDER)[number];
export type InterviewQuestionStage = Exclude<InterviewStage, "feedback">;

export type InterviewStageStatus = {
  current: InterviewStage;
  completed: InterviewStage[];
  pending: InterviewStage[];
};

export type InterviewTurnState = {
  currentStage: InterviewStage;
  totalQuestionCount: number;
  stageQuestionCounts: Record<InterviewQuestionStage, number>;
  completedStages: InterviewQuestionStage[];
  lastQuestionFocus: string | null;
  nextAction: "ask" | "feedback";
};

const QUESTION_STAGE_ORDER: InterviewQuestionStage[] = [
  "industry_reason",
  "role_reason",
  "opening",
  "experience",
  "company_understanding",
  "motivation_fit",
];

const STAGE_LABELS: Record<InterviewQuestionStage, string> = {
  industry_reason: "業界志望理由",
  role_reason: "職種志望理由",
  opening: "導入・人物把握",
  experience: "経験・ガクチカ",
  company_understanding: "企業理解",
  motivation_fit: "志望動機・適合",
};

export function createInitialInterviewTurnState(): InterviewTurnState {
  return {
    currentStage: "industry_reason",
    totalQuestionCount: 0,
    stageQuestionCounts: {
      industry_reason: 0,
      role_reason: 0,
      opening: 0,
      experience: 0,
      company_understanding: 0,
      motivation_fit: 0,
    },
    completedStages: [],
    lastQuestionFocus: null,
    nextAction: "ask",
  };
}

export function getInterviewStageStatus(current: InterviewStage): InterviewStageStatus {
  const currentIndex = INTERVIEW_STAGE_ORDER.indexOf(current);
  return {
    current,
    completed: INTERVIEW_STAGE_ORDER.slice(0, currentIndex),
    pending: INTERVIEW_STAGE_ORDER.slice(currentIndex + 1),
  };
}

export function getInterviewTrackerStatus(input: {
  totalQuestionCount: number;
  currentStage: InterviewStage;
  currentStageQuestionCount?: number;
}) {
  const headline = `${Math.min(input.totalQuestionCount, INTERVIEW_MAX_QUESTION_COUNT)} / ${INTERVIEW_MAX_QUESTION_COUNT}問`;

  if (input.currentStage === "feedback") {
    return {
      headline,
      detail: "最終講評を表示中",
    };
  }

  const stageLabel = STAGE_LABELS[input.currentStage];
  const stageCount = Math.max(1, input.currentStageQuestionCount ?? 1);

  return {
    headline,
    detail: `${stageLabel}を深掘り中 ${stageCount}問目`,
  };
}

export function getCurrentStageQuestionCount(turnState: InterviewTurnState | null | undefined) {
  if (!turnState || turnState.currentStage === "feedback") {
    return 0;
  }
  return turnState.stageQuestionCounts[turnState.currentStage] ?? 0;
}

export function normalizeInterviewTurnState(
  value: Partial<InterviewTurnState> | null | undefined,
): InterviewTurnState {
  const initial = createInitialInterviewTurnState();
  if (!value || typeof value !== "object") {
    return initial;
  }

  const currentStage = INTERVIEW_STAGE_ORDER.includes(value.currentStage as InterviewStage)
    ? (value.currentStage as InterviewStage)
    : initial.currentStage;

  const stageQuestionCounts = QUESTION_STAGE_ORDER.reduce<Record<InterviewQuestionStage, number>>(
    (acc, stage) => {
      const raw = value.stageQuestionCounts?.[stage];
      acc[stage] = typeof raw === "number" && Number.isFinite(raw) && raw >= 0 ? Math.floor(raw) : 0;
      return acc;
    },
    {
      industry_reason: 0,
      role_reason: 0,
      opening: 0,
      experience: 0,
      company_understanding: 0,
      motivation_fit: 0,
    },
  );

  const completedStages = Array.isArray(value.completedStages)
    ? value.completedStages.filter((stage): stage is InterviewQuestionStage =>
        QUESTION_STAGE_ORDER.includes(stage as InterviewQuestionStage),
      )
    : [];

  return {
    currentStage,
    totalQuestionCount:
      typeof value.totalQuestionCount === "number" &&
      Number.isFinite(value.totalQuestionCount) &&
      value.totalQuestionCount >= 0
        ? Math.floor(value.totalQuestionCount)
        : Object.values(stageQuestionCounts).reduce((sum, count) => sum + count, 0),
    stageQuestionCounts,
    completedStages,
    lastQuestionFocus:
      typeof value.lastQuestionFocus === "string" && value.lastQuestionFocus.trim().length > 0
        ? value.lastQuestionFocus.trim()
        : null,
    nextAction: value.nextAction === "feedback" ? "feedback" : "ask",
  };
}

export function shouldChargeInterviewSession(isCompleted: boolean): boolean {
  return isCompleted;
}
