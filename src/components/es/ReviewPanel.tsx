"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { FileText, Loader2, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useOperationLock } from "@/hooks/useOperationLock";
import { useAuth } from "@/components/auth/AuthProvider";
import { useCredits } from "@/hooks/useCredits";
import {
  EXTRA_FIELD_LABELS,
  TEMPLATE_EXTRA_FIELDS,
  TEMPLATE_LABELS,
  TEMPLATE_OPTIONS,
  useESReview,
} from "@/hooks/useESReview";
import type { ReviewMode, TemplateType } from "@/hooks/useESReview";
import {
  DEFAULT_STANDARD_ES_REVIEW_MODEL,
  FREE_PLAN_ES_REVIEW_MODEL,
  getStandardESReviewModelHelper,
  getStandardESReviewModelLabel,
  isLowCostESReviewModel,
  STANDARD_ES_REVIEW_MODEL_OPTIONS,
  type StandardESReviewModel,
} from "@/lib/ai/es-review-models";
import { parseApiErrorResponse, toAppUiError } from "@/lib/api-errors";
import { notifyUserFacingAppError } from "@/lib/client-error-ui";
import { calculateESReviewCost } from "@/lib/credits/cost";
import type { Industry } from "@/lib/constants/industries";
import { COMPANYLESS_EXPLICIT_TEMPLATE_TYPES } from "@/lib/es-review/companyless-templates";
import { inferTemplateTypeDetailsFromQuestion } from "@/lib/es-review/infer-template-type";
import {
  notifyOperationLocked,
  notifyReviewError,
  notifyReviewSuccess,
} from "@/lib/notifications";
import { ReflectModal } from "./ReflectModal";
import type { ReviewValidationField } from "./review-panel-validation";
import {
  getReviewValidationIssues,
  MIN_REVIEW_SECTION_BODY_CHARS,
} from "./review-panel-validation";
import { buildTemplateRecommendationCopy } from "./template-recommendation";
import { ReviewEmptyState } from "./ReviewEmptyState";
import { StreamingReviewResponse } from "./StreamingReviewResponse";
import { CompanyStatusBanner, type CompanyReviewStatus } from "./review-panel-company-banner";

export type { CompanyReviewStatus };

interface SectionReviewRequest {
  sectionTitle: string;
  sectionContent: string;
  sectionCharLimit?: number;
}

interface ReviewPanelProps {
  documentId: string;
  companyReviewStatus?: CompanyReviewStatus;
  companyId?: string;
  companyName?: string;
  onApplyRewrite?: (newContent: string, sectionTitle?: string | null) => void;
  onUndo?: () => void;
  className?: string;
  sectionReviewRequest?: SectionReviewRequest | null;
  onClearSectionReview?: () => void;
  supplementalContent?: ReactNode;
}

interface RoleOptionResponse {
  companyId: string;
  companyName: string;
  industry: string | null;
  requiresIndustrySelection: boolean;
  industryOptions: string[];
  roleGroups: Array<{
    id: string;
    label: string;
    options: Array<{
      value: string;
      label: string;
      source: "industry_default" | "company_override" | "application_job_type" | "document_job_type";
    }>;
  }>;
}

function getStreamingStatusCopy(step: string | null) {
  if (step === "rag_fetch") {
    return {
      title: "企業情報を確認しています",
      description: "添削に必要な情報を集めています。",
    };
  }

  if (step === "analysis") {
    return {
      title: "設問を整理しています",
      description: "回答の土台を整えています。",
    };
  }

  if (step === "rewrite") {
    return {
      title: "改善した回答を提案しています",
      description: "回答の伝わり方を整えています。",
    };
  }

  if (step === "sources") {
    return {
      title: "出典リンクを整理しています",
      description: "参照した情報をまとめています。",
    };
  }

  return {
    title: "AI添削を準備しています",
    description: "結果を順番に表示する準備をしています。",
  };
}

function SetupField({
  label,
  placeholder,
  value,
  onChange,
  invalid = false,
  errorMessage,
  inputId,
  descriptionId,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  invalid?: boolean;
  errorMessage?: string | null;
  inputId?: string;
  descriptionId?: string;
}) {
  return (
    <div className="space-y-2">
      <label htmlFor={inputId} className="text-xs font-medium text-muted-foreground">
        {label}
      </label>
      <Input
        id={inputId}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-invalid={invalid}
        aria-describedby={errorMessage ? descriptionId : undefined}
      />
      {errorMessage ? (
        <p id={descriptionId} className="text-xs leading-5 text-destructive">
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}

function FreePlanEsReviewModelNotice() {
  return (
    <div className="rounded-[26px] border border-border/60 bg-muted/30 p-4 shadow-[0_10px_30px_rgba(15,23,42,0.05)]">
      <p className="text-sm font-semibold text-foreground">添削モデル（Free）</p>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">
        Free プランでは <strong className="font-medium text-foreground">GPT-5.4 mini</strong>
        で添削を行います。プランをアップグレードすると、高性能モデルを選択できるようになります。
      </p>
      <Button className="mt-4 h-9 rounded-full px-4 text-xs" variant="outline" asChild>
        <Link href="/pricing?source=es_review&reason=model_limit">プランを見る</Link>
      </Button>
    </div>
  );
}

function ReviewModeSelector({
  standardModel,
  onStandardModelChange,
}: {
  standardModel: StandardESReviewModel;
  onStandardModelChange: (value: StandardESReviewModel) => void;
}) {
  const helperText = getStandardESReviewModelHelper(standardModel);
  return (
    <div className="rounded-[26px] border border-border/60 bg-background/90 p-4 shadow-[0_10px_30px_rgba(15,23,42,0.05)]">
      <div>
        <p className="text-sm font-semibold text-foreground">モデル選択</p>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          Claude / GPT / Gemini / クレジット消費を抑えて添削 から選べます。
        </p>
      </div>

      <Select
        value={standardModel}
        onValueChange={(nextValue) => {
          onStandardModelChange(nextValue as StandardESReviewModel);
        }}
      >
        <SelectTrigger className="mt-4 h-11 rounded-2xl border-border/60 bg-background">
          <SelectValue placeholder="モデルを選択" />
        </SelectTrigger>
        <SelectContent>
          {STANDARD_ES_REVIEW_MODEL_OPTIONS.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {helperText ? (
        <p className="mt-3 text-xs leading-5 text-amber-700 dark:text-amber-300">
          {helperText}
        </p>
      ) : null}
    </div>
  );
}

function ReviewActionFooter({
  charCount,
  creditCost,
  helperLines,
  buttonLabel,
  disabled,
  onClick,
  loginHref,
}: {
  charCount: number;
  creditCost: number;
  helperLines: string[];
  buttonLabel: string;
  disabled: boolean;
  onClick: () => void;
  loginHref?: string | null;
}) {
  const primary = loginHref ? (
    <Button className="h-11 self-stretch rounded-full px-5 sm:min-w-[220px] sm:self-auto sm:px-6" asChild>
      <Link href={loginHref}>
        <Sparkles className="size-4" />
        {buttonLabel}
      </Link>
    </Button>
  ) : (
    <Button
      className="h-11 self-stretch rounded-full px-5 sm:min-w-[220px] sm:self-auto sm:px-6"
      disabled={disabled}
      onClick={onClick}
    >
      <Sparkles className="size-4" />
      {buttonLabel}
    </Button>
  );

  return (
    <div className="border-t border-border/60 bg-muted/20 px-4 py-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium text-foreground">消費クレジット</p>
            <Badge variant="outline" className="bg-background/80 px-2 py-0.5 text-[11px] text-foreground">
              {creditCost} クレジット
            </Badge>
            <span className="text-xs text-muted-foreground sm:text-sm">{charCount}文字</span>
          </div>
          <div className="space-y-1">
            {helperLines.map((line, index) => (
              <p
                key={`${line}-${index}`}
                className={cn(
                  "text-xs leading-5",
                  index === 0 ? "text-muted-foreground" : "text-destructive",
                )}
              >
                {line}
              </p>
            ))}
          </div>
        </div>

        {primary}
      </div>
    </div>
  );
}

export function ReviewPanel({
  documentId,
  companyReviewStatus = "no_company_selected",
  companyId,
  companyName,
  onApplyRewrite,
  onUndo,
  className,
  sectionReviewRequest,
  onClearSectionReview,
  supplementalContent,
}: ReviewPanelProps) {
  const { acquireLock, releaseLock } = useOperationLock();
  const { isAuthenticated, isGuest, isLoading: isAuthLoading, isReady: isAuthReady } = useAuth();
  const {
    credits,
    balance,
    isLoading: creditsLoading,
    error: creditsError,
    refresh: refreshCredits,
  } = useCredits({ isAuthenticated, isAuthReady });
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateType | null>(null);
  const [internName, setInternName] = useState("");
  const [selectedIndustry, setSelectedIndustry] = useState<Industry | null>(null);
  const [roleName, setRoleName] = useState("");
  const [roleSelectionSource, setRoleSelectionSource] = useState<
    "industry_default" | "company_override" | "application_job_type" | "document_job_type" | "custom" | null
  >(null);
  const [customRoleInput, setCustomRoleInput] = useState("");
  const [roleOptionsData, setRoleOptionsData] = useState<RoleOptionResponse | null>(null);
  const [isRoleOptionsLoading, setIsRoleOptionsLoading] = useState(false);
  const [roleOptionsError, setRoleOptionsError] = useState<string | null>(null);
  const reviewMode: ReviewMode = "standard";
  const [selectedStandardModel, setSelectedStandardModel] = useState<StandardESReviewModel>(
    DEFAULT_STANDARD_ES_REVIEW_MODEL,
  );
  const isFreeEsPlan = Boolean(isAuthenticated && !isGuest && credits?.plan === "free");
  const [showReflectModal, setShowReflectModal] = useState(false);
  const [pendingRewrite, setPendingRewrite] = useState<string | null>(null);
  const [responseInstanceKey, setResponseInstanceKey] = useState(0);
  const [hasShownCompletionToast, setHasShownCompletionToast] = useState(false);
  /** True only after user taps「この設問をAI添削」while setup is incomplete (red frames + footer hint). */
  const [setupErrorHighlight, setSetupErrorHighlight] = useState(false);

  const panelRootRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const lastShownErrorRef = useRef<string | null>(null);

  const templateSectionRef = useRef<HTMLDivElement>(null);
  const industrySectionRef = useRef<HTMLDivElement>(null);
  const internNameFieldRef = useRef<HTMLDivElement>(null);
  const industryFieldRef = useRef<HTMLDivElement>(null);
  const roleFieldRef = useRef<HTMLDivElement>(null);
  const sectionBodyRef = useRef<HTMLDivElement>(null);

  const {
    review,
    visibleRewriteText,
    explanationText,
    explanationComplete,
    visibleSources,
    finalRewriteText,
    playbackPhase,
    isPlaybackComplete,
    isLoading,
    error,
    errorAction,
    currentSection,
    elapsedTime,
    sseProgress,
    requestSectionReview,
    clearReview,
  } = useESReview({
    documentId,
    esReviewBillingPlan: credits?.plan === "free" ? "free" : undefined,
  });

  useEffect(() => {
    if (credits?.plan === "free") {
      setSelectedStandardModel(FREE_PLAN_ES_REVIEW_MODEL);
    }
  }, [credits?.plan]);

  const hasSelectedCompany = companyReviewStatus !== "no_company_selected";
  const templateOptions = useMemo(() => {
    const auto = { value: "auto" as const, label: "自動" };
    if (hasSelectedCompany) {
      return [auto, ...TEMPLATE_OPTIONS.map((option) => ({ value: option.value, label: option.label }))];
    }
    return [
      auto,
      ...TEMPLATE_OPTIONS.filter((option) =>
        (COMPANYLESS_EXPLICIT_TEMPLATE_TYPES as readonly string[]).includes(option.value),
      ).map((option) => ({ value: option.value, label: option.label })),
    ];
  }, [hasSelectedCompany]);

  const inferredTemplateDetails = useMemo(() => {
    if (!sectionReviewRequest?.sectionTitle) {
      return inferTemplateTypeDetailsFromQuestion("");
    }
    return inferTemplateTypeDetailsFromQuestion(sectionReviewRequest.sectionTitle);
  }, [sectionReviewRequest?.sectionTitle]);

  const inferredTemplate = inferredTemplateDetails.templateType as TemplateType;

  const effectiveTemplate: TemplateType = selectedTemplate ?? inferredTemplate;
  const selectedTemplateFields = TEMPLATE_EXTRA_FIELDS[effectiveTemplate] ?? [];
  const requiresInternName = selectedTemplateFields.includes("intern_name");
  const requiresIndustrySelection =
    hasSelectedCompany && Boolean(roleOptionsData?.requiresIndustrySelection);
  const currentCharLimit = currentSection?.charLimit ?? sectionReviewRequest?.sectionCharLimit;
  const selectedRoleName = roleName.trim();
  const selectedTemplateValue = selectedTemplate ?? "auto";
  const currentTemplateLabel = selectedTemplate ? TEMPLATE_LABELS[selectedTemplate] : "自動判定";
  const templateRecommendationCopy = buildTemplateRecommendationCopy({
    selectedTemplate,
    details: inferredTemplateDetails,
  });
  const currentReviewModeLabel = isFreeEsPlan
    ? "GPT-5.4 mini（Free 固定）"
    : getStandardESReviewModelLabel(selectedStandardModel);
  const missingTemplateField = selectedTemplateFields.find((fieldName) => {
    if (fieldName === "intern_name") {
      return !internName.trim();
    }

    if (fieldName === "role_name") {
      return !selectedRoleName;
    }

    return false;
  });
  const missingTemplateFieldLabel = missingTemplateField
    ? (EXTRA_FIELD_LABELS[missingTemplateField] ?? missingTemplateField)
    : null;
  const templateLabel = review?.template_review
    ? TEMPLATE_LABELS[review.template_review.template_type as TemplateType]
    : selectedTemplate
      ? TEMPLATE_LABELS[selectedTemplate]
      : undefined;
  const streamingStatus = getStreamingStatusCopy(sseProgress.currentStep);
  const hasVisibleResults = Boolean(
    visibleRewriteText.trim() || visibleSources.length > 0,
  );
  const hasResponse = isLoading || hasVisibleResults;
  const hasFinalResult = Boolean(review);
  const hasCompletedReview = hasFinalResult && isPlaybackComplete;
  const companyStatusDensity = hasResponse || Boolean(error) ? "compact" : "full";
  const showFooter = Boolean(sectionReviewRequest);
  const isCustomRoleActive = roleSelectionSource === "custom" && Boolean(customRoleInput.trim());
  const isTemplateSetupComplete = !missingTemplateField;
  const isRoleSetupComplete =
    !hasSelectedCompany ||
    ((!requiresIndustrySelection || Boolean(selectedIndustry)) && Boolean(selectedRoleName));
  const sectionBodyTrimLen = sectionReviewRequest?.sectionContent.trim().length ?? 0;
  const validationIssues = getReviewValidationIssues({
    sectionContent: sectionReviewRequest?.sectionContent ?? "",
    requiresInternName,
    internName,
    hasSelectedCompany,
    requiresIndustrySelection,
    selectedIndustry,
    selectedRoleName,
  });
  const invalidFieldSet = useMemo(
    () => new Set(validationIssues.map((issue) => issue.field)),
    [validationIssues],
  );
  const fieldInvalid = (field: ReviewValidationField) =>
    setupErrorHighlight && invalidFieldSet.has(field);
  const industrySectionInvalid =
    setupErrorHighlight && (fieldInvalid("industry") || fieldInvalid("role_name"));
  const creditCost = calculateESReviewCost(
    sectionReviewRequest?.sectionContent.length ?? 0,
    isFreeEsPlan ? FREE_PLAN_ES_REVIEW_MODEL : selectedStandardModel,
    isFreeEsPlan ? { userPlan: "free" } : undefined,
  );
  const authPending = isAuthLoading || !isAuthReady;
  const requiresLoginForReview = !authPending && (!isAuthenticated || isGuest);
  const creditsUnavailable = authPending || (isAuthenticated && (creditsLoading || Boolean(creditsError)));
  const insufficientCredits =
    !authPending && isAuthenticated && !creditsUnavailable && balance < creditCost;
  const isFooterLocked = isLoading || (hasResponse && !isPlaybackComplete);
  const reviewActionHint =
    sectionBodyTrimLen < MIN_REVIEW_SECTION_BODY_CHARS
      ? "本文を5文字以上入力してください。"
      : authPending
        ? "AI添削の利用条件を確認しています。"
        : requiresLoginForReview
          ? "AI添削はログインユーザー向け機能です。"
        : creditsLoading
          ? "クレジット残高を確認しています。"
          : creditsError
            ? "クレジット情報を取得できませんでした。少し待ってから再度お試しください。"
      : !isTemplateSetupComplete && missingTemplateFieldLabel
          ? `${missingTemplateFieldLabel}を入力してください。`
          : isRoleOptionsLoading
            ? "職種候補を読み込んでいます。"
            : roleOptionsError
              ? "職種候補を取得できていません。再読み込みしてからお試しください。"
              : requiresIndustrySelection && !selectedIndustry
                ? "先に業界を選択してください。"
                : hasSelectedCompany && !selectedRoleName
                  ? "先に職種を選択してください。"
                  : insufficientCredits
                    ? `クレジットが不足しています（残高 ${balance} / 必要 ${creditCost}）`
                    : "準備できました。この設問をAI添削できます。";
  const canStartReview =
    sectionBodyTrimLen >= MIN_REVIEW_SECTION_BODY_CHARS &&
    !authPending &&
    !requiresLoginForReview &&
    isTemplateSetupComplete &&
    !creditsUnavailable &&
    !isRoleOptionsLoading &&
    !roleOptionsError &&
    (!requiresIndustrySelection || Boolean(selectedIndustry)) &&
    (!hasSelectedCompany || Boolean(selectedRoleName)) &&
    !insufficientCredits;
  const footerHelperText = error
    ? "添削結果を表示できませんでした。もう一度お試しください。"
    : isFooterLocked
      ? "添削中です。完了までお待ちください。"
      : hasCompletedReview
        ? "前回の条件を保持したまま、設定を見直して再添削できます。"
        : canStartReview
          ? isFreeEsPlan
            ? `GPT-5.4 mini 相当で実行します。クレジットはプレミアム帯と同じ目安で、今回 ${creditCost} クレジットです。`
            : isLowCostESReviewModel(selectedStandardModel)
              ? `${getStandardESReviewModelLabel(selectedStandardModel)}で実行します。今回の見積りは${creditCost}クレジットです。品質はやや下がる可能性があります。`
              : `${getStandardESReviewModelLabel(selectedStandardModel)}で実行します。今回の見積りは${creditCost}クレジットです。`
          : reviewActionHint;
  const footerHelperLines =
    setupErrorHighlight && !canStartReview
      ? [
          "赤字の枠内を入力・選択してください。",
          ...(validationIssues[0]?.message ? [validationIssues[0].message] : [reviewActionHint]),
        ]
      : [footerHelperText];
  const footerLoginHref = requiresLoginForReview ? "/login" : null;

  const footerButtonLabel = error
    ? "この設問を再試行"
    : isFooterLocked
      ? "添削中..."
      : authPending
        ? "確認中"
      : requiresLoginForReview
        ? "ログインして添削する"
        : creditsLoading
          ? "クレジット確認中"
          : creditsError
            ? "残高確認エラー"
      : insufficientCredits
        ? "クレジット不足"
        : hasCompletedReview
          ? "条件を見直して再添削"
          : "この設問をAI添削";
  const footerActionDisabled =
    isFooterLocked ||
    authPending ||
    (!footerLoginHref && requiresLoginForReview) ||
    creditsUnavailable ||
    insufficientCredits;
  useEffect(() => {
    if (!sectionReviewRequest) {
      return;
    }

    setSetupErrorHighlight(false);
    setSelectedTemplate(null);
    setInternName("");
  }, [sectionReviewRequest]);

  useEffect(() => {
    if (canStartReview) {
      setSetupErrorHighlight(false);
    }
  }, [canStartReview]);

  useEffect(() => {
    if (
      !hasSelectedCompany &&
      selectedTemplate &&
      !(COMPANYLESS_EXPLICIT_TEMPLATE_TYPES as readonly string[]).includes(selectedTemplate)
    ) {
      setSelectedTemplate(null);
    }
  }, [hasSelectedCompany, selectedTemplate]);

  useEffect(() => {
    setSelectedIndustry(null);
    setRoleName("");
    setRoleSelectionSource(null);
    setCustomRoleInput("");
    setRoleOptionsData(null);
    setRoleOptionsError(null);
  }, [companyId, documentId, hasSelectedCompany]);

  useEffect(() => {
    if (!sectionReviewRequest || !hasSelectedCompany || !companyId) {
      return;
    }

    const controller = new AbortController();
    const searchParams = new URLSearchParams({ documentId });
    if (selectedIndustry) {
      searchParams.set("industry", selectedIndustry);
    }

    setIsRoleOptionsLoading(true);
    setRoleOptionsError(null);

    fetch(`/api/companies/${companyId}/es-role-options?${searchParams.toString()}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          throw await parseApiErrorResponse(
            response,
            {
              code: "ES_ROLE_OPTIONS_FETCH_FAILED",
              userMessage: "業界・職種候補を読み込めませんでした。",
              action: "時間を置いて、もう一度お試しください。",
              retryable: true,
            },
            "ReviewPanel.fetchRoleOptions"
          );
        }
        return response.json() as Promise<RoleOptionResponse>;
      })
      .then((data) => {
        if (controller.signal.aborted) {
          return;
        }
        setRoleOptionsData(data);
        setSelectedIndustry((prev) => {
          if (prev && data.industryOptions.includes(prev)) {
            return prev;
          }
          return data.industry && data.industryOptions.includes(data.industry)
            ? (data.industry as Industry)
            : null;
        });
      })
      .catch((fetchError: unknown) => {
        if (controller.signal.aborted) {
          return;
        }
        setRoleOptionsData(null);
        const uiError = toAppUiError(
          fetchError,
          {
            code: "ES_ROLE_OPTIONS_FETCH_FAILED",
            userMessage: "業界・職種候補を読み込めませんでした。",
            action: "時間を置いて、もう一度お試しください。",
            retryable: true,
          },
          "ReviewPanel.fetchRoleOptions"
        );
        setRoleOptionsError(uiError.message);
        notifyUserFacingAppError(uiError);
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsRoleOptionsLoading(false);
        }
      });

    return () => controller.abort();
  }, [companyId, documentId, hasSelectedCompany, sectionReviewRequest, selectedIndustry]);

  useEffect(() => {
    if (!roleOptionsData || roleSelectionSource === "custom") {
      return;
    }

    const availableRoles = new Set(
      roleOptionsData.roleGroups.flatMap((group) => group.options.map((option) => option.value)),
    );
    if (selectedRoleName && !availableRoles.has(selectedRoleName)) {
      setRoleName("");
      setRoleSelectionSource(null);
    }
  }, [roleOptionsData, roleSelectionSource, selectedRoleName]);

  useEffect(() => {
    if (review && isPlaybackComplete && !hasShownCompletionToast) {
      notifyReviewSuccess(companyReviewStatus === "ready_for_es_review");
      setHasShownCompletionToast(true);
    }
  }, [companyReviewStatus, hasShownCompletionToast, isPlaybackComplete, review]);

  useEffect(() => {
    if (!hasResponse) {
      setHasShownCompletionToast(false);
    }
  }, [hasResponse]);

  useEffect(() => {
    if (!error) {
      lastShownErrorRef.current = null;
      return;
    }

    const signature = `${error}\0${errorAction ?? ""}`;
    if (lastShownErrorRef.current === signature) {
      return;
    }

    notifyReviewError({ message: error, action: errorAction });
    lastShownErrorRef.current = signature;
  }, [error, errorAction]);

  const scrollPanelToTopForStreaming = useCallback(() => {
    const container = scrollContainerRef.current;
    if (container) {
      container.scrollTop = 0;
    }
    panelRootRef.current?.scrollIntoView({ block: "start", behavior: "auto" });
  }, []);

  /**
   * 添削開始時の scrollTo(top) は、hasResponse になる前の DOM（セットアップ画面）に対して
   * 走ってしまい、ストリーミング UI に差し替わったあと無効になる。
   * コミット直後に先頭へ寄せる（useLayoutEffect でペイント前に実行）。
   */
  useLayoutEffect(() => {
    if (!isLoading) {
      return;
    }
    scrollPanelToTopForStreaming();
  }, [isLoading, scrollPanelToTopForStreaming]);

  const handleSectionReview = useCallback(async () => {
    if (!sectionReviewRequest) {
      return false;
    }
    if (!acquireLock("ES添削を実行中")) {
      notifyOperationLocked();
      return false;
    }

    try {
      setResponseInstanceKey((prev) => prev + 1);
      setHasShownCompletionToast(false);
      return await requestSectionReview({
        sectionTitle: sectionReviewRequest.sectionTitle,
        sectionContent: sectionReviewRequest.sectionContent,
        sectionCharLimit: sectionReviewRequest.sectionCharLimit,
        hasCompanyRag: companyReviewStatus === "ready_for_es_review",
        companyId,
        templateType: selectedTemplate ?? undefined,
        internName: requiresInternName ? internName || undefined : undefined,
        roleName: selectedRoleName || undefined,
        industryOverride: selectedIndustry || undefined,
        roleSelectionSource: roleSelectionSource || undefined,
        reviewMode,
        llmModel: isFreeEsPlan ? FREE_PLAN_ES_REVIEW_MODEL : selectedStandardModel,
      });
    } finally {
      releaseLock();
    }
  }, [
    acquireLock,
    companyId,
    companyReviewStatus,
    internName,
    isFreeEsPlan,
    roleSelectionSource,
    releaseLock,
    requestSectionReview,
    selectedStandardModel,
    selectedRoleName,
    selectedIndustry,
    sectionReviewRequest,
    requiresInternName,
    selectedTemplate,
  ]);

  const handleReviewFooterAction = useCallback(async () => {
    if (hasCompletedReview) {
      clearReview();
      return;
    }
    if (!canStartReview) {
      setSetupErrorHighlight(true);
      const firstIssue = validationIssues[0];
      const firstRef =
        firstIssue?.field === "section_content"
          ? sectionBodyRef
          : firstIssue?.field === "intern_name"
            ? internNameFieldRef
            : firstIssue?.field === "industry"
              ? industryFieldRef
              : firstIssue?.field === "role_name"
                ? roleFieldRef
                : firstIssue?.section === "template"
                  ? templateSectionRef
                  : firstIssue?.section === "industry"
                    ? industrySectionRef
                    : null;
      (firstRef ?? templateSectionRef).current?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    const completed = await handleSectionReview();
    if (completed) {
      await refreshCredits();
    }
  }, [canStartReview, clearReview, handleSectionReview, hasCompletedReview, refreshCredits, validationIssues]);

  const handleApplyRewrite = useCallback((rewriteText: string) => {
    setPendingRewrite(rewriteText);
    setShowReflectModal(true);
  }, []);

  const handleConfirmReflect = useCallback(() => {
    if (pendingRewrite && onApplyRewrite) {
      onApplyRewrite(pendingRewrite, currentSection ? currentSection.title : null);
    }
    setShowReflectModal(false);
    setPendingRewrite(null);
  }, [currentSection, onApplyRewrite, pendingRewrite]);

  const handleReset = useCallback(() => {
    setSetupErrorHighlight(false);
    clearReview();
    onClearSectionReview?.();
  }, [clearReview, onClearSectionReview]);

  return (
    <div ref={panelRootRef} className={cn("flex min-h-0 flex-col", className)}>
      <div
        ref={scrollContainerRef}
        className="min-h-0 flex-1 overflow-y-auto [overflow-anchor:none]"
      >
        <div className="space-y-4">
          {hasSelectedCompany ? (
            <CompanyStatusBanner
              status={companyReviewStatus}
              companyName={companyName}
              companyId={companyId}
              density={companyStatusDensity}
            />
          ) : null}

          {!sectionReviewRequest && !hasResponse && !error ? (
            <ReviewEmptyState
              companyReviewStatus={companyReviewStatus}
              companyName={companyName}
              companyId={companyId}
            />
          ) : null}

          {sectionReviewRequest && !hasResponse && !error ? (
            <div className="space-y-4">
              <div
                ref={sectionBodyRef}
                className={cn(
                  "rounded-[26px] border bg-background p-4 shadow-sm",
                  fieldInvalid("section_content")
                    ? "border-destructive/60 ring-2 ring-destructive/20"
                    : "border-border/70",
                )}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                      <FileText className="size-4" />
                    </div>
                    <div>
                      <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                        対象設問
                      </p>
                      <h3 className="mt-1 text-base font-semibold text-foreground">
                        {sectionReviewRequest.sectionTitle}
                      </h3>
                      <p className="mt-2 text-sm leading-6 text-muted-foreground">
                        改善案と出典リンクをこの順で表示します。
                      </p>
                    </div>
                  </div>

                  {sectionReviewRequest.sectionCharLimit ? (
                    <Badge variant="soft-info" className="px-3 py-1 text-[11px]">
                      {sectionReviewRequest.sectionCharLimit}字上限
                    </Badge>
                  ) : null}
                </div>

                <div
                  className={cn(
                    "mt-4 rounded-[22px] border px-4 py-3 bg-background/85",
                    fieldInvalid("section_content")
                      ? "border-destructive/60"
                      : "border-border/60",
                  )}
                  aria-invalid={fieldInvalid("section_content")}
                >
                  <p className="line-clamp-5 whitespace-pre-wrap text-sm leading-7 text-foreground/88">
                    {sectionReviewRequest.sectionContent || "（本文がまだありません）"}
                  </p>
                  {fieldInvalid("section_content") ? (
                    <p
                      id="review-section-body-error"
                      className="mt-2 text-sm font-medium text-destructive"
                      role="alert"
                    >
                      {validationIssues.find((i) => i.field === "section_content")?.message ??
                        "本文を5文字以上入力してください。"}
                    </p>
                  ) : null}
                </div>
              </div>

              <div
                ref={templateSectionRef}
                className={cn(
                  "rounded-[26px] border bg-background/90 p-4 shadow-[0_10px_30px_rgba(15,23,42,0.05)]",
                  fieldInvalid("intern_name")
                    ? "border-destructive/60 ring-2 ring-destructive/20"
                    : "border-border/60",
                )}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-foreground">設問タイプ</p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      {hasSelectedCompany
                        ? "分かる場合は指定し、迷うときは自動判定のまま添削できます。"
                        : "企業未選択では、自動・ガクチカ・自己PR・価値観のいずれかに合わせて添削します。企業に紐づく設問は企業を選んでからお試しください。"}
                    </p>
                  </div>
                  {isTemplateSetupComplete ? (
                    <Badge variant="soft-success" className="px-3 py-1 text-[11px]">
                      準備完了
                    </Badge>
                  ) : null}
                </div>

                <div className="mt-4 rounded-[22px] border border-border/60 bg-background/85 p-4">
                  <p className="text-sm font-semibold text-foreground">設問タイプを選択してください</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    {selectedTemplate
                      ? "選択した型に合わせて添削の観点を調整します。"
                      : "自動判定では設問文から最適な型を推定します。"}
                  </p>
                  <div
                    className={cn(
                      "mt-3 rounded-2xl border px-3 py-2",
                      templateRecommendationCopy.selectionDiffersFromInference
                        ? "border-amber-200/80 bg-amber-50/80 dark:border-amber-800/50 dark:bg-amber-950/40"
                        : "border-emerald-200/80 bg-emerald-50/80",
                    )}
                  >
                    <p
                      className={cn(
                        "text-xs font-semibold",
                        templateRecommendationCopy.selectionDiffersFromInference
                          ? "text-amber-900 dark:text-amber-200"
                          : "text-emerald-900",
                      )}
                    >
                      {templateRecommendationCopy.label}
                    </p>
                    <p
                      className={cn(
                        "mt-1 text-xs leading-5",
                        templateRecommendationCopy.selectionDiffersFromInference
                          ? "text-amber-800 dark:text-amber-100/90"
                          : "text-emerald-800",
                      )}
                    >
                      {templateRecommendationCopy.description}
                    </p>
                  </div>
                  <Select
                    value={selectedTemplateValue}
                    onValueChange={(value) => {
                      const nextTemplate = value === "auto" ? null : (value as TemplateType);
                      setSelectedTemplate(nextTemplate);
                      if (!nextTemplate || !TEMPLATE_EXTRA_FIELDS[nextTemplate].includes("intern_name")) {
                        setInternName("");
                      }
                    }}
                  >
                    <SelectTrigger className="mt-3 h-11 rounded-2xl">
                      <SelectValue placeholder="設問タイプを選択してください" />
                    </SelectTrigger>
                    <SelectContent>
                      {templateOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {selectedTemplateFields.length > 0 ? (
                    <div className="mt-4 space-y-3">
                      {selectedTemplateFields.map((fieldName) => (
                        <div
                          key={fieldName}
                          ref={fieldName === "intern_name" ? internNameFieldRef : undefined}
                          className={cn(
                            "rounded-2xl border p-3 transition-colors",
                            fieldInvalid("intern_name") ? "border-destructive/60" : "border-transparent",
                          )}
                        >
                          <SetupField
                            label={EXTRA_FIELD_LABELS[fieldName] ?? fieldName}
                            placeholder={
                              fieldName === "intern_name"
                                ? "例: 夏季インターン"
                                : "例: エンジニアコース"
                            }
                            value={fieldName === "intern_name" ? internName : roleName}
                            onChange={fieldName === "intern_name" ? setInternName : setRoleName}
                            invalid={fieldName === "intern_name" && fieldInvalid("intern_name")}
                            errorMessage={
                              fieldName === "intern_name" && fieldInvalid("intern_name")
                                ? validationIssues.find((issue) => issue.field === "intern_name")?.message ?? null
                                : null
                            }
                            inputId={fieldName === "intern_name" ? "review-intern-name" : undefined}
                            descriptionId={fieldName === "intern_name" ? "review-intern-name-error" : undefined}
                          />
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>

              {isFreeEsPlan ? (
                <FreePlanEsReviewModelNotice />
              ) : (
                <ReviewModeSelector
                  standardModel={selectedStandardModel}
                  onStandardModelChange={setSelectedStandardModel}
                />
              )}

              {hasSelectedCompany ? (
                <div
                ref={industrySectionRef}
                className={cn(
                  "rounded-[26px] border bg-background/90 p-4 shadow-[0_10px_30px_rgba(15,23,42,0.05)]",
                    industrySectionInvalid
                      ? "border-destructive/60 ring-2 ring-destructive/20"
                      : "border-border/60",
                  )}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-foreground">業界・職種</p>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">
                        業界と職種を選択してから添削を実行してください。
                      </p>
                    </div>
                    {isRoleSetupComplete ? (
                      <Badge variant="soft-success" className="px-3 py-1 text-[11px]">
                        準備完了
                      </Badge>
                    ) : null}
                  </div>

                  {isRoleOptionsLoading ? (
                    <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="size-4 animate-spin" />
                      職種候補を読み込んでいます。
                    </div>
                  ) : null}

                  {roleOptionsError ? (
                    <div className="mt-4 rounded-2xl border border-destructive/20 bg-destructive/8 px-4 py-3 text-sm text-muted-foreground">
                      {roleOptionsError}
                    </div>
                  ) : null}

                  {roleOptionsData ? (
                    <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                      <div className="space-y-2 rounded-[22px] border border-border/60 bg-background/85 p-4">
                        <div
                          ref={industryFieldRef}
                          className="rounded-2xl transition-colors"
                        >
                        <p className="text-sm font-semibold text-foreground">業界を選択してください</p>
                        <p className="text-xs leading-5 text-muted-foreground">
                          {requiresIndustrySelection
                            ? "企業情報だけでは業界が広いため、添削前に選択が必要です。"
                            : selectedIndustry
                              ? `「${selectedIndustry}」を初期選択しています。必要なら変更してください。`
                              : "企業情報に合わせて業界を選択してください。"}
                        </p>
                        <Select
                          value={selectedIndustry ?? ""}
                          onValueChange={(value) => {
                            setSelectedIndustry(value as Industry);
                            setRoleName("");
                            setRoleSelectionSource(null);
                            setCustomRoleInput("");
                          }}
                        >
                          <SelectTrigger
                            className={cn(
                              "mt-3 h-11 rounded-2xl",
                              fieldInvalid("industry")
                                ? "border-destructive ring-3 ring-destructive/20"
                                : "",
                            )}
                            aria-invalid={fieldInvalid("industry")}
                            aria-describedby={fieldInvalid("industry") ? "review-industry-error" : undefined}
                          >
                            <SelectValue placeholder="業界を選択してください" />
                          </SelectTrigger>
                          <SelectContent>
                            {roleOptionsData.industryOptions.map((industry) => (
                              <SelectItem key={industry} value={industry}>
                                {industry}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {fieldInvalid("industry") ? (
                          <p id="review-industry-error" className="mt-2 text-xs leading-5 text-destructive">
                            {validationIssues.find((issue) => issue.field === "industry")?.message}
                          </p>
                        ) : null}
                        </div>
                      </div>

                      <div className="space-y-2 rounded-[22px] border border-border/60 bg-background/85 p-4">
                        <div
                          ref={roleFieldRef}
                          className="rounded-2xl transition-colors"
                        >
                        <p className="text-sm font-semibold text-foreground">職種を選択してください</p>
                        <p className="text-xs leading-5 text-muted-foreground">
                          {selectedIndustry
                            ? "候補から選び、見つからない場合だけ自由入力を使ってください。"
                            : hasSelectedCompany
                              ? "先に業界を選ぶと、この企業向けの職種候補を表示します。"
                              : "先に業界を選ぶと、職種候補を表示します。"}
                        </p>
                        <Select
                          disabled={!selectedIndustry || roleOptionsData.roleGroups.length === 0}
                          value={roleSelectionSource === "custom" ? "" : selectedRoleName}
                          onValueChange={(value) => {
                            const matched = roleOptionsData.roleGroups
                              .flatMap((group) => group.options)
                              .find((option) => option.value === value);
                            setRoleName(value);
                            setRoleSelectionSource(matched?.source ?? "industry_default");
                            setCustomRoleInput("");
                          }}
                        >
                          <SelectTrigger
                            className={cn(
                              "mt-3 h-11 rounded-2xl",
                              fieldInvalid("role_name")
                                ? "border-destructive ring-3 ring-destructive/20"
                                : "",
                            )}
                            aria-invalid={fieldInvalid("role_name")}
                            aria-describedby={fieldInvalid("role_name") ? "review-role-error" : undefined}
                          >
                            <SelectValue
                              placeholder={
                                selectedIndustry
                                  ? "職種を選択してください"
                                  : "先に業界を選択してください"
                              }
                            />
                          </SelectTrigger>
                          <SelectContent>
                            {roleOptionsData.roleGroups.map((group) => (
                              <SelectGroup key={group.id}>
                                <SelectLabel className="text-xs font-normal text-muted-foreground">
                                  {group.label}
                                </SelectLabel>
                                {group.options.map((option) => (
                                  <SelectItem key={`${group.id}-${option.value}`} value={option.value}>
                                    {option.label}
                                  </SelectItem>
                                ))}
                              </SelectGroup>
                            ))}
                          </SelectContent>
                        </Select>

                        <div className="pt-2">
                          <label className="text-xs font-medium text-muted-foreground">
                            候補にない場合のみ職種を入力
                          </label>
                          <Input
                            className="mt-2"
                            disabled={!selectedIndustry}
                            placeholder="例: デジタル企画、プロダクトマネージャー"
                            value={customRoleInput}
                            aria-invalid={fieldInvalid("role_name")}
                            aria-describedby={fieldInvalid("role_name") ? "review-role-error" : undefined}
                            onChange={(event) => {
                              const nextValue = event.target.value;
                              setCustomRoleInput(nextValue);
                              setRoleName(nextValue);
                              setRoleSelectionSource(nextValue.trim() ? "custom" : null);
                            }}
                          />
                          {isCustomRoleActive ? (
                            <p className="mt-2 text-xs text-muted-foreground">
                              現在は自由入力の職種を優先して添削します。
                            </p>
                          ) : null}
                        </div>
                        {fieldInvalid("role_name") ? (
                          <p id="review-role-error" className="mt-2 text-xs leading-5 text-destructive">
                            {validationIssues.find((issue) => issue.field === "role_name")?.message}
                          </p>
                        ) : null}

                        {selectedIndustry && roleOptionsData.roleGroups.length === 0 ? (
                          <p className="text-xs text-muted-foreground">
                            候補がないため、下の自由入力欄から職種を指定してください。
                          </p>
                        ) : null}
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {currentTemplateLabel || selectedIndustry || selectedRoleName || currentReviewModeLabel ? (
                <div className="rounded-[22px] border border-border/60 bg-muted/30 px-4 py-3">
                  <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
                    現在の設定
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {currentTemplateLabel ? (
                      <Badge variant="soft-primary" className="px-3 py-1 text-[11px]">
                        設問タイプ: {currentTemplateLabel}
                      </Badge>
                    ) : null}
                    {selectedIndustry ? (
                      <Badge variant="soft-info" className="px-3 py-1 text-[11px]">
                        業界: {selectedIndustry}
                      </Badge>
                    ) : null}
                    {selectedRoleName ? (
                      <Badge variant="soft-primary" className="px-3 py-1 text-[11px]">
                        職種: {selectedRoleName}
                      </Badge>
                    ) : null}
                    <Badge variant="outline" className="px-3 py-1 text-[11px]">
                      モデル: {currentReviewModeLabel}
                    </Badge>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          {hasResponse ? (
            <div className="space-y-3">
              <StreamingReviewResponse
                key={responseInstanceKey}
                visibleRewriteText={visibleRewriteText}
                explanationText={explanationText}
                explanationComplete={explanationComplete}
                finalRewriteText={finalRewriteText}
                sources={visibleSources}
                charLimit={currentCharLimit}
                templateLabel={templateLabel}
                isStreaming={isLoading}
                playbackPhase={playbackPhase}
                isPlaybackComplete={isPlaybackComplete}
                progressTitle={streamingStatus.title}
                progressDescription={streamingStatus.description}
                progressPercent={sseProgress.progress}
                elapsedTime={elapsedTime}
                showActions={hasFinalResult}
                reviewMeta={review?.review_meta}
                onApply={handleApplyRewrite}
              />
            </div>
          ) : null}

          {error ? (
            <div className="rounded-[24px] border border-destructive/20 bg-destructive/8 p-4">
              <p className="text-sm font-semibold text-foreground">添削結果を表示できませんでした。</p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{error}</p>
              <Button variant="outline" className="mt-4 rounded-full" onClick={handleReset}>
                閉じる
              </Button>
            </div>
          ) : null}

          {supplementalContent}
        </div>
      </div>

      {showFooter && sectionReviewRequest ? (
        <ReviewActionFooter
          charCount={sectionReviewRequest.sectionContent.length}
          creditCost={creditCost}
          helperLines={footerHelperLines}
          buttonLabel={footerButtonLabel}
          disabled={footerActionDisabled}
          onClick={handleReviewFooterAction}
          loginHref={footerLoginHref}
        />
      ) : null}

      <ReflectModal
        isOpen={showReflectModal}
        onClose={() => {
          setShowReflectModal(false);
          setPendingRewrite(null);
        }}
        onConfirm={handleConfirmReflect}
        onUndo={onUndo}
        originalText={sectionReviewRequest?.sectionContent || ""}
        newText={pendingRewrite || ""}
        isFullDocument={false}
      />
    </div>
  );
}
