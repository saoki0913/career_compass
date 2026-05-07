import type { InterviewFeedback, InterviewMessage } from "./conversation";
import type {
  InterviewFormat,
  InterviewPlan,
  InterviewRoleTrack,
  InterviewRoundStage,
  InterviewSelectionType,
  InterviewStageStatus,
  InterviewStrictnessMode,
  InterviewTurnMeta,
  InterviewTurnState,
  InterviewerType,
} from "./session";

export type {
  InterviewFeedback,
  InterviewFeedbackConfidence,
  InterviewFeedbackScores,
  InterviewMessage,
  InterviewShortCoaching,
} from "./conversation";
export type { InterviewPlan } from "./plan";
export type {
  InterviewCoverageState,
  InterviewCoverageStatus,
  InterviewFormat,
  InterviewFormatPhase,
  InterviewRecentQuestionSummaryV2,
  InterviewRoleTrack,
  InterviewRoundStage,
  InterviewSelectionType,
  InterviewStageStatus,
  InterviewStrictnessMode,
  InterviewTurnMeta,
  InterviewTurnState,
  InterviewerType,
} from "./session";

export type InterviewMaterialCard = {
  label: string;
  text: string;
  kind?:
    | "motivation"
    | "gakuchika"
    | "es"
    | "academic"
    | "research"
    | "industry_seed"
    | "company_seed";
};

export type InterviewSetupState = {
  selectedIndustry: string | null;
  selectedRole: string | null;
  selectedRoleSource: string | null;
  resolvedIndustry: string | null;
  requiresIndustrySelection: boolean;
  industryOptions: string[];
  roleTrack: InterviewRoleTrack;
  interviewFormat: InterviewFormat;
  selectionType: InterviewSelectionType;
  interviewStage: InterviewRoundStage;
  interviewerType: InterviewerType;
  strictnessMode: InterviewStrictnessMode;
};

export type InterviewFeedbackHistoryItem = {
  id: string;
  overallComment: string;
  scores: InterviewFeedback["scores"];
  strengths: string[];
  improvements: string[];
  consistencyRisks: string[];
  weakestQuestionType: string | null;
  weakestTurnId: string | null;
  weakestQuestionSnapshot: string | null;
  weakestAnswerSnapshot: string | null;
  improvedAnswer: string;
  nextPreparation: string[];
  premiseConsistency: number;
  satisfactionScore: number | null;
  scoreEvidenceByAxis?: Record<string, string[]>;
  scoreRationaleByAxis?: Record<string, string>;
  confidenceByAxis?: Record<string, string>;
  sourceQuestionCount: number;
  createdAt: string;
};

export type HydratedInterviewConversation = {
  id: string;
  status: "setup_pending" | "in_progress" | "question_flow_completed" | "feedback_completed";
  messages: InterviewMessage[];
  turnState: InterviewTurnState;
  turnMeta: InterviewTurnMeta | null;
  plan: InterviewPlan | null;
  stageStatus: InterviewStageStatus;
  questionCount: number;
  questionFlowCompleted: boolean;
  feedback: InterviewFeedback | null;
  selectedIndustry: string | null;
  selectedRole: string | null;
  selectedRoleSource: string | null;
  roleTrack: InterviewRoleTrack | null;
  interviewFormat: InterviewFormat | null;
  selectionType: InterviewSelectionType | null;
  interviewStage: InterviewRoundStage | null;
  interviewerType: InterviewerType | null;
  strictnessMode: InterviewStrictnessMode | null;
  isLegacySession: boolean;
};

export type PersistedInterviewSetup = {
  roleTrack?: string | null;
  interviewFormat?: string | null;
  selectionType?: string | null;
  interviewStage?: string | null;
  interviewerType?: string | null;
  strictnessMode?: string | null;
};
