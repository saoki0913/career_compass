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
