import type {
  CausalGap as BaseCausalGap,
  EvidenceCard,
  Message as BaseMessage,
  MotivationConversationContext,
  MotivationProgress,
  MotivationStage,
  StageStatus,
} from "./conversation";
export type { MotivationSetupSnapshot } from "./conversation-payload";

export interface MotivationMessage extends BaseMessage {
  id: string;
  isOptimistic?: boolean;
}

export interface MotivationCompany {
  id: string;
  name: string;
  industry: string | null;
}

export type RoleOptionSource =
  | "industry_default"
  | "company_override"
  | "application_job_type"
  | "document_job_type";

export type RoleSelectionSource = RoleOptionSource | "custom";

export interface RoleOptionItem {
  value: string;
  label: string;
  source: RoleOptionSource;
}

export interface RoleGroup {
  id: string;
  label: string;
  options: RoleOptionItem[];
}

export interface RoleOptionsResponse {
  companyId: string;
  companyName: string;
  industry: string | null;
  requiresIndustrySelection: boolean;
  industryOptions: string[];
  roleGroups: RoleGroup[];
}

export type MotivationStageKey = MotivationStage;
export type ConversationMode = NonNullable<MotivationConversationContext["conversationMode"]>;
export type CausalGap = BaseCausalGap;
export type { EvidenceCard, MotivationProgress, StageStatus };

export const STAGE_LABELS: Record<MotivationStageKey, string> = {
  industry_reason: "業界志望理由を整理中",
  company_reason: "企業志望理由を整理中",
  self_connection: "自分との接続を整理中",
  desired_work: "やりたい仕事を確認中",
  value_contribution: "価値発揮を整理中",
  differentiation: "他社との差を整理中",
  closing: "仕上げを整理中",
};

export const STAGE_ORDER: MotivationStageKey[] = [
  "industry_reason",
  "company_reason",
  "self_connection",
  "desired_work",
  "value_contribution",
  "differentiation",
];

export const STAGE_ANSWER_GUIDE: Record<MotivationStageKey, string> = {
  industry_reason: "その業界を志望する理由を1文で答える",
  company_reason: "この企業のどこに惹かれたかを1文で答える",
  self_connection: "自分の経験や価値観がどうつながるかを1文で答える",
  desired_work: "入社後に挑戦したい仕事を1文で答える",
  value_contribution: "入社後にどう価値を出したいかを1文で答える",
  differentiation: "他社ではなくこの企業を選ぶ理由を1文で答える",
  closing: "最後に伝えたい目標を短くまとめる",
};

export const CONVERSATION_MODE_LABELS: Record<ConversationMode, string> = {
  slot_fill: "材料を集めています",
  deepdive: "弱い部分を補強しています",
};

export const INTENT_LABELS: Record<string, string> = {
  initial_capture: "まず要点を回収します",
  clarify_axis: "志望軸を明確にします",
  specificity_check: "抽象さを具体化します",
  company_unique_point: "その企業ならではを確認します",
  experience_anchor: "経験とのつながりを補います",
  value_anchor: "価値観との接続を補います",
  role_reason_capture: "なぜその職種かを補います",
  work_image_clarify: "仕事のイメージを明確にします",
  contribution_shape: "貢献の形を明確にします",
  compare_or_unique_point: "他社との差分を確認します",
};

export function findRoleOption(roleGroups: RoleGroup[], value: string | null | undefined) {
  if (!value) return null;
  return roleGroups.flatMap((group) => group.options).find((option) => option.value === value) || null;
}

// ---------------------------------------------------------------------------
// Slot pill labels & status
// ---------------------------------------------------------------------------

export const SLOT_PILL_LABELS: Record<Exclude<MotivationStageKey, "closing">, string> = {
  industry_reason: "業界理由",
  company_reason: "企業理由",
  self_connection: "自己接続",
  desired_work: "希望業務",
  value_contribution: "価値貢献",
  differentiation: "差別化",
};

export type PillStatus = "done" | "current" | "pending";

export function getMotivationSlotPillStatus(
  slot: Exclude<MotivationStageKey, "closing">,
  stageStatus: StageStatus | null,
): PillStatus {
  if (!stageStatus) return "pending";
  const current = stageStatus.current === "closing" ? "differentiation" : stageStatus.current;
  if (stageStatus.completed.includes(slot) ||
      (slot === "differentiation" && stageStatus.completed.includes("closing"))) {
    return "done";
  }
  if (current === slot) return "current";
  return "pending";
}

// ---------------------------------------------------------------------------
// Motivation lifecycle phases
// ---------------------------------------------------------------------------

export type MotivationLifecyclePhase = "slot_fill" | "draft_ready" | "deep_dive_active" | "interview_ready";

export function getMotivationLifecyclePhase(
  isDraftReady: boolean,
  conversationMode: ConversationMode,
  hasNextQuestion: boolean,
  hasCausalGaps: boolean,
): MotivationLifecyclePhase {
  if (!isDraftReady) return "slot_fill";
  if (conversationMode !== "deepdive") return "draft_ready";
  if (hasNextQuestion || hasCausalGaps) return "deep_dive_active";
  return "interview_ready";
}

export const MOTIVATION_LIFECYCLE_PHASES = [
  { key: "draft_ready", label: "ES作成可" },
  { key: "deep_dive_active", label: "深堀り中" },
  { key: "interview_ready", label: "面接準備完了" },
] as const;

export function deriveMotivationModeLabel(params: {
  conversationMode: ConversationMode;
  questionCount: number;
  isDraftReady: boolean;
  causalGapCount: number;
}): string {
  const { conversationMode, questionCount, isDraftReady, causalGapCount } = params;

  if (conversationMode === "deepdive") {
    return causalGapCount > 0 ? `補強中（残り${causalGapCount}件）` : "補強完了";
  }

  if (isDraftReady) return "材料が揃いました";
  if (questionCount <= 2) return "志望動機の土台を整えています";
  return "材料をもう少し揃えています";
}

export function getMotivationPhaseStatus(
  phaseKey: "draft_ready" | "deep_dive_active" | "interview_ready",
  currentPhase: MotivationLifecyclePhase,
): PillStatus {
  const TABLE: Record<MotivationLifecyclePhase, Record<string, PillStatus>> = {
    slot_fill:        { draft_ready: "current", deep_dive_active: "pending", interview_ready: "pending" },
    draft_ready:      { draft_ready: "done",    deep_dive_active: "pending", interview_ready: "pending" },
    deep_dive_active: { draft_ready: "done",    deep_dive_active: "current", interview_ready: "pending" },
    interview_ready:  { draft_ready: "done",    deep_dive_active: "done",    interview_ready: "done" },
  };
  return TABLE[currentPhase]?.[phaseKey] ?? "pending";
}
