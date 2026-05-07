import {
  EXTRA_FIELD_LABELS,
  TEMPLATE_EXTRA_FIELDS,
  TEMPLATE_LABELS,
} from "@/features/es-review/hooks/template-meta";
import type { ReviewMode, TemplateType } from "@/features/es-review/hooks/types";
import {
  FREE_PLAN_ES_REVIEW_MODEL,
  getStandardESReviewModelLabel,
  isLowCostESReviewModel,
  type StandardESReviewModel,
} from "@/lib/ai/es-review-models";
import { calculateESReviewCost } from "@/lib/credits/cost";
import type { Industry } from "@/lib/constants/industries";
import { inferTemplateTypeDetailsFromQuestion } from "@/lib/es-review/infer-template-type";
import {
  requiresIndustryForESReviewTemplate,
  requiresRoleForESReviewTemplate,
} from "@/lib/es-review/template-requirements";
import {
  getReviewValidationIssues,
  MIN_REVIEW_SECTION_BODY_CHARS,
  type ReviewValidationIssue,
} from "./review-panel-validation";

export type RoleSelectionSource =
  | "industry_default"
  | "company_override"
  | "application_job_type"
  | "document_job_type"
  | "custom";

export interface ReviewPanelSectionRequest {
  sectionId?: string;
  sectionTitle: string;
  sectionContent: string;
  originalTextHash?: string;
  templateType?: TemplateType;
  companyId?: string | null;
  roleName?: string | null;
  sectionCharLimit?: number;
}

interface ReviewPanelControllerInput {
  sectionReviewRequest?: ReviewPanelSectionRequest | null;
  selectedTemplate: TemplateType | null;
  internName: string;
  hasSelectedCompany: boolean;
  selectedIndustry: Industry | null;
  roleName: string;
  isFreeEsPlan: boolean;
  selectedStandardModel: StandardESReviewModel;
  authPending: boolean;
  isAuthenticated: boolean;
  creditsLoading: boolean;
  hasCreditsError: boolean;
  balance: number;
  isRoleOptionsLoading: boolean;
  roleOptionsError: string | null;
  isLoading: boolean;
  hasResponse: boolean;
  isPlaybackComplete: boolean;
  hasCompletedReview: boolean;
  isCancelling: boolean;
  error: string | null;
  setupErrorHighlight: boolean;
}

export interface ReviewPanelControllerState {
  inferredTemplateDetails: ReturnType<typeof inferTemplateTypeDetailsFromQuestion>;
  inferredTemplate: TemplateType;
  effectiveTemplate: TemplateType;
  selectedTemplateFields: readonly string[];
  requiresInternName: boolean;
  requiresIndustrySelection: boolean;
  requiresRoleSelection: boolean;
  selectedRoleName: string;
  selectedTemplateValue: TemplateType | "auto";
  currentTemplateLabel: string;
  currentReviewModeLabel: string;
  missingTemplateFieldLabel: string | null;
  isTemplateSetupComplete: boolean;
  isRoleSetupComplete: boolean;
  sectionBodyTrimLen: number;
  validationIssues: ReviewValidationIssue[];
  creditCost: number;
  requiresLoginForReview: boolean;
  creditsUnavailable: boolean;
  insufficientCredits: boolean;
  isFooterLocked: boolean;
  reviewActionHint: string;
  canStartReview: boolean;
  footerHelperText: string;
  footerHelperLines: string[];
  footerLoginHref: string | null;
  footerButtonLabel: string;
  footerActionDisabled: boolean;
}

export function deriveReviewPanelControllerState(
  input: ReviewPanelControllerInput,
): ReviewPanelControllerState {
  const inferredTemplateDetails = inferTemplateTypeDetailsFromQuestion(
    input.sectionReviewRequest?.sectionTitle ?? "",
  );
  const inferredTemplate = inferredTemplateDetails.templateType as TemplateType;
  const effectiveTemplate = input.selectedTemplate ?? inferredTemplate;
  const selectedTemplateFields = TEMPLATE_EXTRA_FIELDS[effectiveTemplate] ?? [];
  const requiresInternName = selectedTemplateFields.includes("intern_name");
  const requiresIndustrySelection =
    input.hasSelectedCompany && requiresIndustryForESReviewTemplate(effectiveTemplate);
  const requiresRoleSelection =
    input.hasSelectedCompany && requiresRoleForESReviewTemplate(effectiveTemplate);
  const selectedRoleName = input.roleName.trim();
  const selectedTemplateValue = input.selectedTemplate ?? "auto";
  const currentTemplateLabel = input.selectedTemplate
    ? TEMPLATE_LABELS[input.selectedTemplate]
    : "自動判定";
  const currentReviewModeLabel = input.isFreeEsPlan
    ? "GPT-5.4 mini（Free 固定）"
    : getStandardESReviewModelLabel(input.selectedStandardModel);
  const missingTemplateField = selectedTemplateFields.find((fieldName) => {
    if (fieldName === "intern_name") {
      return !input.internName.trim();
    }

    if (fieldName === "role_name") {
      return !selectedRoleName;
    }

    return false;
  });
  const missingTemplateFieldLabel = missingTemplateField
    ? (EXTRA_FIELD_LABELS[missingTemplateField] ?? missingTemplateField)
    : null;
  const isTemplateSetupComplete = !missingTemplateField;
  const isRoleSetupComplete =
    !input.hasSelectedCompany ||
    ((!requiresIndustrySelection || Boolean(input.selectedIndustry)) && Boolean(selectedRoleName));
  const sectionBodyTrimLen = input.sectionReviewRequest?.sectionContent.trim().length ?? 0;
  const validationIssues = getReviewValidationIssues({
    sectionContent: input.sectionReviewRequest?.sectionContent ?? "",
    requiresInternName,
    internName: input.internName,
    hasSelectedCompany: input.hasSelectedCompany,
    requiresIndustrySelection,
    requiresRoleSelection,
    selectedIndustry: input.selectedIndustry,
    selectedRoleName,
  });
  const creditCost = calculateESReviewCost(
    input.sectionReviewRequest?.sectionContent.length ?? 0,
    input.isFreeEsPlan ? FREE_PLAN_ES_REVIEW_MODEL : input.selectedStandardModel,
    input.isFreeEsPlan ? { userPlan: "free" } : undefined,
  );
  const effectiveRequiresLoginForReview =
    !input.authPending && !input.isAuthenticated;
  const creditsUnavailable =
    input.authPending || (input.isAuthenticated && (input.creditsLoading || input.hasCreditsError));
  const insufficientCredits =
    !input.authPending &&
    input.isAuthenticated &&
    !creditsUnavailable &&
    input.balance < creditCost;
  const isFooterLocked = input.isLoading || (input.hasResponse && !input.isPlaybackComplete);
  const reviewActionHint = getReviewActionHint({
    sectionBodyTrimLen,
    authPending: input.authPending,
    requiresLoginForReview: effectiveRequiresLoginForReview,
    creditsLoading: input.creditsLoading,
    hasCreditsError: input.hasCreditsError,
    isTemplateSetupComplete,
    missingTemplateFieldLabel,
    isRoleOptionsLoading: input.isRoleOptionsLoading,
    roleOptionsError: input.roleOptionsError,
    requiresIndustrySelection,
    selectedIndustry: input.selectedIndustry,
    requiresRoleSelection,
    selectedRoleName,
    insufficientCredits,
    balance: input.balance,
    creditCost,
  });
  const canStartReview =
    sectionBodyTrimLen >= MIN_REVIEW_SECTION_BODY_CHARS &&
    !input.authPending &&
    !effectiveRequiresLoginForReview &&
    isTemplateSetupComplete &&
    !creditsUnavailable &&
    !input.isRoleOptionsLoading &&
    !input.roleOptionsError &&
    (!requiresIndustrySelection || Boolean(input.selectedIndustry)) &&
    (!requiresRoleSelection || Boolean(selectedRoleName)) &&
    !insufficientCredits;
  const footerHelperText = getFooterHelperText({
    error: input.error,
    isFooterLocked,
    isCancelling: input.isCancelling,
    hasCompletedReview: input.hasCompletedReview,
    canStartReview,
    isFreeEsPlan: input.isFreeEsPlan,
    selectedStandardModel: input.selectedStandardModel,
    creditCost,
    reviewActionHint,
  });
  const footerHelperLines =
    input.setupErrorHighlight && !canStartReview
      ? [
          "赤字の枠内を入力・選択してください。",
          validationIssues[0]?.message ?? reviewActionHint,
        ]
      : [footerHelperText];
  const footerLoginHref = effectiveRequiresLoginForReview ? "/login" : null;
  const footerButtonLabel = getFooterButtonLabel({
    error: input.error,
    isFooterLocked,
    isCancelling: input.isCancelling,
    authPending: input.authPending,
    requiresLoginForReview: effectiveRequiresLoginForReview,
    creditsLoading: input.creditsLoading,
    hasCreditsError: input.hasCreditsError,
    insufficientCredits,
    hasCompletedReview: input.hasCompletedReview,
  });
  const footerActionDisabled =
    (isFooterLocked && !input.isLoading) ||
    input.authPending ||
    (!footerLoginHref && effectiveRequiresLoginForReview) ||
    creditsUnavailable ||
    insufficientCredits;

  return {
    inferredTemplateDetails,
    inferredTemplate,
    effectiveTemplate,
    selectedTemplateFields,
    requiresInternName,
    requiresIndustrySelection,
    requiresRoleSelection,
    selectedRoleName,
    selectedTemplateValue,
    currentTemplateLabel,
    currentReviewModeLabel,
    missingTemplateFieldLabel,
    isTemplateSetupComplete,
    isRoleSetupComplete,
    sectionBodyTrimLen,
    validationIssues,
    creditCost,
    requiresLoginForReview: effectiveRequiresLoginForReview,
    creditsUnavailable,
    insufficientCredits,
    isFooterLocked,
    reviewActionHint,
    canStartReview,
    footerHelperText,
    footerHelperLines,
    footerLoginHref,
    footerButtonLabel,
    footerActionDisabled,
  };
}

interface BuildReviewRequestParamsInput {
  sectionReviewRequest: ReviewPanelSectionRequest;
  companyId?: string;
  selectedTemplate: TemplateType | null;
  requiresInternName: boolean;
  internName: string;
  selectedRoleName: string;
  selectedIndustry: Industry | null;
  roleSelectionSource: RoleSelectionSource | null;
  reviewMode: ReviewMode;
  isFreeEsPlan: boolean;
  selectedStandardModel: StandardESReviewModel;
}

export function buildSectionReviewRequestParams(input: BuildReviewRequestParamsInput) {
  return {
    sectionTitle: input.sectionReviewRequest.sectionTitle,
    sectionId: input.sectionReviewRequest.sectionId,
    sectionContent: input.sectionReviewRequest.sectionContent,
    sectionCharLimit: input.sectionReviewRequest.sectionCharLimit,
    companyId: input.companyId,
    templateType: input.selectedTemplate ?? undefined,
    internName: input.requiresInternName ? input.internName || undefined : undefined,
    roleName: input.selectedRoleName || undefined,
    industryOverride: input.selectedIndustry || undefined,
    roleSelectionSource: input.roleSelectionSource || undefined,
    reviewMode: input.reviewMode,
    llmModel: input.isFreeEsPlan ? FREE_PLAN_ES_REVIEW_MODEL : input.selectedStandardModel,
  };
}

export function templateHasInternNameField(templateType: TemplateType): boolean {
  return (TEMPLATE_EXTRA_FIELDS[templateType] ?? []).includes("intern_name");
}

function getReviewActionHint(input: {
  sectionBodyTrimLen: number;
  authPending: boolean;
  requiresLoginForReview: boolean;
  creditsLoading: boolean;
  hasCreditsError: boolean;
  isTemplateSetupComplete: boolean;
  missingTemplateFieldLabel: string | null;
  isRoleOptionsLoading: boolean;
  roleOptionsError: string | null;
  requiresIndustrySelection: boolean;
  selectedIndustry: Industry | null;
  requiresRoleSelection: boolean;
  selectedRoleName: string;
  insufficientCredits: boolean;
  balance: number;
  creditCost: number;
}) {
  if (input.sectionBodyTrimLen < MIN_REVIEW_SECTION_BODY_CHARS) {
    return "本文を6文字以上入力してください。";
  }
  if (input.authPending) {
    return "AI添削の利用条件を確認しています。";
  }
  if (input.requiresLoginForReview) {
    return "AI添削はログインユーザー向け機能です。";
  }
  if (input.creditsLoading) {
    return "クレジット残高を確認しています。";
  }
  if (input.hasCreditsError) {
    return "クレジット情報を取得できませんでした。少し待ってから再度お試しください。";
  }
  if (!input.isTemplateSetupComplete && input.missingTemplateFieldLabel) {
    return `${input.missingTemplateFieldLabel}を入力してください。`;
  }
  if (input.isRoleOptionsLoading) {
    return "職種候補を読み込んでいます。";
  }
  if (input.roleOptionsError) {
    return "職種候補を取得できていません。再読み込みしてからお試しください。";
  }
  if (input.requiresIndustrySelection && !input.selectedIndustry) {
    return "先に業界を選択してください。";
  }
  if (input.requiresRoleSelection && !input.selectedRoleName) {
    return "先に職種を選択してください。";
  }
  if (input.insufficientCredits) {
    return `クレジットが不足しています（残高 ${input.balance} / 必要 ${input.creditCost}）`;
  }
  return "準備できました。この設問をAI添削できます。";
}

function getFooterHelperText(input: {
  error: string | null;
  isFooterLocked: boolean;
  isCancelling: boolean;
  hasCompletedReview: boolean;
  canStartReview: boolean;
  isFreeEsPlan: boolean;
  selectedStandardModel: StandardESReviewModel;
  creditCost: number;
  reviewActionHint: string;
}) {
  if (input.error) {
    return "添削結果を表示できませんでした。もう一度お試しください。";
  }
  if (input.isFooterLocked) {
    return input.isCancelling
      ? "添削を中止しています。結果は反映されず、クレジットは消費されません。"
      : "添削中です。必要なら中止できます。";
  }
  if (input.hasCompletedReview) {
    return "前回の条件を保持したまま、設定を見直して再添削できます。";
  }
  if (!input.canStartReview) {
    return input.reviewActionHint;
  }
  if (input.isFreeEsPlan) {
    return `GPT-5.4 mini 相当で実行します。クレジットはプレミアム帯と同じ目安で、今回 ${input.creditCost} クレジットです。`;
  }
  if (isLowCostESReviewModel(input.selectedStandardModel)) {
    return `${getStandardESReviewModelLabel(input.selectedStandardModel)}で実行します。今回の見積りは${input.creditCost}クレジットです。品質はやや下がる可能性があります。`;
  }
  return `${getStandardESReviewModelLabel(input.selectedStandardModel)}で実行します。今回の見積りは${input.creditCost}クレジットです。`;
}

function getFooterButtonLabel(input: {
  error: string | null;
  isFooterLocked: boolean;
  isCancelling: boolean;
  authPending: boolean;
  requiresLoginForReview: boolean;
  creditsLoading: boolean;
  hasCreditsError: boolean;
  insufficientCredits: boolean;
  hasCompletedReview: boolean;
}) {
  if (input.error) {
    return "この設問を再試行";
  }
  if (input.isFooterLocked) {
    return input.isCancelling ? "中止しています" : "中止";
  }
  if (input.authPending) {
    return "確認中";
  }
  if (input.requiresLoginForReview) {
    return "ログインして添削する";
  }
  if (input.creditsLoading) {
    return "クレジット確認中";
  }
  if (input.hasCreditsError) {
    return "残高確認エラー";
  }
  if (input.insufficientCredits) {
    return "クレジット不足";
  }
  if (input.hasCompletedReview) {
    return "条件を見直して再添削";
  }
  return "この設問をAI添削";
}
