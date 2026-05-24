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
} from "@/lib/interview/session";
import type { InterviewShortCoaching } from "@/lib/interview/conversation";
import type { InterviewSheetData } from "@/lib/interview/sheet-builder";
import { labelInterviewTopic } from "@/lib/interview/topic-labels";

export const INDUSTRY_SELECT_UNSET = "__interview_industry_unset__";
export const ROLE_SELECT_UNSET = "__interview_role_unset__";
export const INTERVIEW_PERSISTENCE_UNAVAILABLE_CODE = "INTERVIEW_PERSISTENCE_UNAVAILABLE";

export type Message = {
  role: "user" | "assistant";
  content: string;
};

export type MaterialCard = {
  label: string;
  text: string;
  kind?: "motivation" | "gakuchika" | "academic" | "research" | "es" | "industry_seed" | "company_seed";
};

export type Feedback = {
  overall_comment: string;
  scores: {
    company_fit?: number;
    role_fit?: number;
    specificity?: number;
    logic?: number;
    persuasiveness?: number;
    consistency?: number;
    credibility?: number;
  };
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
  score_evidence_by_axis?: Record<string, string[]>;
  score_rationale_by_axis?: Record<string, string>;
  confidence_by_axis?: Record<string, string>;
};

export type FeedbackHistoryItem = {
  id: string;
  overallComment: string;
  scores: Feedback["scores"];
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
  sheetDataJson?: InterviewSheetData | null;
  sheetContent?: string | null;
  sourceQuestionCount: number;
  createdAt: string;
};

export type InterviewBillingCosts = {
  start: number;
  turn: number;
  continue: number;
  feedback: number;
};

export type InterviewSessionState = {
  status: HydratedConversation["status"];
  isActive: boolean;
  isLegacySession: boolean;
  questionCount: number;
  hasFeedback: boolean;
};

export type {
  RoleGroup,
  RoleOption,
  RoleOptionSource,
  RoleOptionsResponse,
  RoleSelectionSource,
} from "@/shared/contracts/interview/role-options";

export type SetupState = {
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

export type HydratedConversation = {
  id: string | null;
  status: "setup_pending" | "in_progress" | "question_flow_completed" | "feedback_completed";
  messages: Message[];
  plan: InterviewPlan | null;
  turnMeta: InterviewTurnMeta | null;
  turnState: InterviewTurnState;
  stageStatus: InterviewStageStatus;
  questionCount: number;
  questionStage: string | null;
  questionFlowCompleted: boolean;
  feedback: Feedback | null;
  selectedIndustry: string | null;
  selectedRole: string | null;
  selectedRoleSource: string | null;
  roleTrack: InterviewRoleTrack | null;
  interviewFormat: InterviewFormat | null;
  selectionType: InterviewSelectionType | null;
  interviewStage: InterviewRoundStage | null;
  interviewerType: InterviewerType | null;
  strictnessMode: InterviewStrictnessMode | null;
  isLegacySession?: boolean;
};

export type PendingCompleteData = {
  messages: Message[];
  questionCount: number;
  transitionLine: string | null;
  stageStatus: InterviewStageStatus | null;
  questionStage: string | null;
  focus: string | null;
  feedback: Feedback | null;
  questionFlowCompleted: boolean;
  creditCost: number;
  turnState: InterviewTurnState | null;
  turnMeta?: InterviewTurnMeta | null;
  plan?: InterviewPlan | null;
  feedbackHistories?: FeedbackHistoryItem[];
  // Phase 2 Stage 6: turn SSE complete の short coaching (turn only, 他 kind は null)。
  // UI 表示は Stage 8 ダッシュボードと一括実装予定。現時点は state に保持のみ。
  shortCoaching?: InterviewShortCoaching | null;
  nextQuestionHint?: string | null;
};

export function createEmptyFeedback(): Feedback {
  return {
    overall_comment: "",
    scores: {},
    strengths: [],
    improvements: [],
    consistency_risks: [],
    weakest_question_type: null,
    weakest_turn_id: null,
    weakest_question_snapshot: null,
    weakest_answer_snapshot: null,
    improved_answer: "",
    next_preparation: [],
    premise_consistency: undefined,
    satisfaction_score: undefined,
    score_evidence_by_axis: undefined,
    score_rationale_by_axis: undefined,
    confidence_by_axis: undefined,
  };
}

export const INTERVIEW_FORMAT_LABELS: Record<InterviewFormat, string> = {
  standard_behavioral: "通常面接",
  case: "ケース面接",
  technical: "技術 / 専門面接",
  life_history: "自分史面接",
};

export const SELECTION_TYPE_LABELS: Record<InterviewSelectionType, string> = {
  internship: "インターン",
  fulltime: "本選考",
};

export const INTERVIEW_STAGE_LABELS: Record<InterviewRoundStage, string> = {
  early: "一次 / 序盤",
  mid: "二次 / 中盤",
  final: "最終",
};

export const INTERVIEWER_TYPE_LABELS: Record<InterviewerType, string> = {
  hr: "人事",
  line_manager: "現場",
  executive: "役員",
  mixed_panel: "複数面接官",
};

export const STRICTNESS_MODE_LABELS: Record<InterviewStrictnessMode, string> = {
  supportive: "やさしめ",
  standard: "標準",
  strict: "厳しめ",
};

export const ROLE_TRACK_LABELS: Record<InterviewRoleTrack, string> = {
  biz_general: "文系総合職 / 営業 / 企画",
  it_product: "IT / プロダクト",
  frontend_engineer: "フロントエンド",
  backend_engineer: "バックエンド",
  data_ai: "データ / AI",
  infra_platform: "インフラ / Platform / SRE",
  product_manager: "プロダクトマネージャー",
  consulting: "コンサル",
  research_specialist: "研究 / 専門職",
  quant_finance: "クオンツ / 数理",
};

const WEAKEST_QUESTION_TYPE_LABELS: Record<string, string> = {
  motivation: "志望動機",
  gakuchika: "ガクチカ",
  academic: "学業・成績",
  research: "研究",
  personal: "人物像",
  career: "キャリア",
  case: "ケース",
  life_history: "自分史",
  technical: "技術・専門",
};

export function labelWeakestQuestionType(raw: string | null | undefined): string | null {
  if (!raw) return null;
  return WEAKEST_QUESTION_TYPE_LABELS[raw] ?? raw;
}

// --- Progress display helpers (shared component integration) ---

export interface TopicStage {
  key: string;
  label: string;
  status: "done" | "current" | "pending";
}

export function buildInterviewTopicStages(
  stageStatus: InterviewStageStatus | null,
  questionFlowCompleted: boolean,
): TopicStage[] {
  if (!stageStatus) return [];
  const covered = new Set(stageStatus.coveredTopics ?? []);
  const current = stageStatus.currentTopicLabel;
  const seen = new Set<string>();
  const topics: string[] = [];
  for (const t of [
    ...(stageStatus.coveredTopics ?? []),
    ...(current ? [current] : []),
    ...(stageStatus.remainingTopics ?? []),
  ]) {
    if (t && !seen.has(t)) {
      seen.add(t);
      topics.push(t);
    }
  }
  return topics.map((topic, i) => ({
    key: `topic-${i}-${topic}`,
    label: labelInterviewTopic(topic),
    status:
      topic === current && !questionFlowCompleted
        ? "current"
        : covered.has(topic)
          ? "done"
          : "pending",
  }));
}

export function buildInterviewQuestionDisplay(
  questionCount: number,
  _stageStatus: InterviewStageStatus | null,
): string {
  if (questionCount === 0) return "開始前";
  return `${questionCount}問目 / 約15問`;
}

export function buildInterviewCoachingNarrative(
  stageStatus: InterviewStageStatus | null,
  questionCount: number,
): string | null {
  const current = stageStatus?.currentTopicLabel;
  if (!current) {
    return questionCount === 0 ? "初回質問を準備中" : null;
  }
  const covered = stageStatus?.coveredTopics ?? [];
  const currentLabel = labelInterviewTopic(current);
  if (covered.includes(current)) {
    return `${currentLabel}の深掘りが完了しました。`;
  }
  return `${currentLabel}について確認しています。`;
}
