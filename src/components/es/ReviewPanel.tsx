"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowUpRight,
  Building2,
  CheckCircle2,
  FileText,
  Loader2,
  Sparkles,
} from "lucide-react";
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
import {
  COMPANYLESS_TEMPLATE_TYPES,
  EXTRA_FIELD_LABELS,
  TEMPLATE_EXTRA_FIELDS,
  TEMPLATE_LABELS,
  TEMPLATE_OPTIONS,
  useESReview,
} from "@/hooks/useESReview";
import type { ReviewMode, TemplateType } from "@/hooks/useESReview";
import {
  DEFAULT_STANDARD_ES_REVIEW_MODEL,
  getStandardESReviewModelLabel,
  STANDARD_ES_REVIEW_MODEL_OPTIONS,
  type StandardESReviewModel,
} from "@/lib/ai/es-review-models";
import { parseApiErrorResponse, toAppUiError } from "@/lib/api-errors";
import { calculateESReviewCost } from "@/lib/credits/cost";
import type { Industry } from "@/lib/constants/industries";
import { notifyReviewComplete } from "@/lib/notifications";
import { ReflectModal } from "./ReflectModal";
import { ReviewEmptyState } from "./ReviewEmptyState";
import { StreamingReviewResponse } from "./StreamingReviewResponse";

export type CompanyReviewStatus =
  | "no_company_selected"
  | "company_selected_not_fetched"
  | "company_status_checking"
  | "company_fetched_but_not_ready"
  | "ready_for_es_review";

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
      description: "改善案の方向性を固めています。",
    };
  }

  if (step === "rewrite") {
    return {
      title: "改善した回答を提案しています",
      description: "回答の伝わり方を整えています。",
    };
  }

  if (step === "finalize") {
    return {
      title: "改善ポイントを整理しています",
      description: "修正すべき点を順にまとめています。",
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

function CompanyStatusBanner({
  status,
  companyName,
  companyId,
  density = "full",
}: {
  status: CompanyReviewStatus;
  companyName?: string;
  companyId?: string;
  density?: "full" | "compact";
}) {
  if (status === "no_company_selected") {
    return null;
  }

  const sharedLink = companyId ? (
    <Link
      href={`/companies/${companyId}`}
      className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-foreground underline underline-offset-2"
    >
      企業情報を見る
      <ArrowUpRight className="size-3.5" />
    </Link>
  ) : null;
  const compactLink = companyId ? (
    <Link
      href={`/companies/${companyId}`}
      className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-foreground underline underline-offset-2"
    >
      {status === "company_selected_not_fetched" ? "企業情報を取得する" : "企業情報を見る"}
      <ArrowUpRight className="size-3.5" />
    </Link>
  ) : null;

  if (density === "compact") {
    if (status === "ready_for_es_review") {
      return (
        <div className="rounded-[18px] border border-success/20 bg-success/8 px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-success/12 text-success">
                <CheckCircle2 className="size-4" />
              </div>
              <p className="text-sm font-medium text-foreground">
                {companyName ? `${companyName}の企業情報と連携済みです。` : "企業情報連携済みです。"}
              </p>
            </div>
          </div>
        </div>
      );
    }

    if (status === "company_status_checking") {
      return (
        <div className="rounded-[18px] border border-border/60 bg-background/80 px-4 py-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
            </div>
            <p className="text-sm font-medium text-foreground">企業情報の連携状況を確認中です。</p>
          </div>
        </div>
      );
    }

    if (status === "company_fetched_but_not_ready") {
      return (
        <div className="rounded-[18px] border border-info/20 bg-info/8 px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-info/14 text-info">
                <Building2 className="size-4" />
              </div>
              <p className="text-sm font-medium text-foreground">
                企業情報は取得済みですが、ES添削に使える情報がまだ不足しています。
              </p>
            </div>
            {compactLink}
          </div>
        </div>
      );
    }

    return (
      <div className="rounded-[18px] border border-warning/20 bg-warning/10 px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-warning/20 text-warning-foreground">
              <Building2 className="size-4" />
            </div>
            <p className="text-sm font-medium text-foreground">
              企業情報を取得すると、企業に合わせた添削ができます。
            </p>
          </div>
          {compactLink}
        </div>
      </div>
    );
  }

  if (status === "ready_for_es_review") {
    return (
      <div className="rounded-[22px] border border-success/20 bg-success/8 p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-success/12 text-success">
            <CheckCircle2 className="size-4" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">
              {companyName ? `${companyName}の企業情報と連携してAI添削できます。` : "企業情報連携済みです。"}
            </p>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              改善案、改善ポイント、出典リンクを順に返します。
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (status === "company_status_checking") {
    return (
      <div className="rounded-[22px] border border-border/60 bg-background/80 p-4">
        <p className="text-sm font-semibold text-foreground">企業情報の連携状況を確認中です。</p>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">
          判定が完了すると、出典表示の有無もこのパネルへ自動反映します。
        </p>
      </div>
    );
  }

  if (status === "company_fetched_but_not_ready") {
    return (
      <div className="rounded-[22px] border border-info/20 bg-info/8 p-4">
        <p className="text-sm font-semibold text-foreground">
          企業情報は取得済みですが、ES添削に使える情報がまだ不足しています。
        </p>
        {sharedLink}
      </div>
    );
  }

  return (
    <div className="rounded-[22px] border border-warning/20 bg-warning/10 p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-warning/20 text-warning-foreground">
          <Building2 className="size-4" />
        </div>
        <div>
          <p className="text-sm font-semibold text-foreground">
            企業情報を取得すると、企業に合わせた添削ができます。
          </p>
          {companyId ? (
            <Link
              href={`/companies/${companyId}`}
              className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-foreground underline underline-offset-2"
            >
              企業情報を取得する
              <ArrowUpRight className="size-3.5" />
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function SetupField({
  label,
  placeholder,
  value,
  onChange,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-2">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      <Input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
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
  return (
    <div className="rounded-[26px] border border-border/60 bg-background/90 p-4 shadow-[0_10px_30px_rgba(15,23,42,0.05)]">
      <div>
        <p className="text-sm font-semibold text-foreground">モデル選択</p>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          ES添削で使うモデルを選択できます。
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
            <SelectItem key={option.value} value={option.value} disabled={!option.enabled}>
              {option.label}
              {!option.enabled && option.disabledReason ? ` (${option.disabledReason})` : ""}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function ReviewActionFooter({
  charCount,
  creditCost,
  helperText,
  buttonLabel,
  disabled,
  onClick,
}: {
  charCount: number;
  creditCost: number;
  helperText: string;
  buttonLabel: string;
  disabled: boolean;
  onClick: () => void;
}) {
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
          <p className="truncate text-xs leading-5 text-muted-foreground">{helperText}</p>
        </div>

        <Button
          className="h-11 self-stretch rounded-full px-5 sm:min-w-[220px] sm:self-auto sm:px-6"
          disabled={disabled}
          onClick={onClick}
        >
          <Sparkles className="size-4" />
          {buttonLabel}
        </Button>
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
  const [showReflectModal, setShowReflectModal] = useState(false);
  const [pendingRewrite, setPendingRewrite] = useState<string | null>(null);
  const [responseInstanceKey, setResponseInstanceKey] = useState(0);
  const [hasShownCompletionToast, setHasShownCompletionToast] = useState(false);
  const [validationErrors, setValidationErrors] = useState<Set<string>>(new Set());

  // Scroll refs (Phase 4 + 5)
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const userHasScrolledRef = useRef(false);
  const lastProgrammaticScrollRef = useRef(false);

  // Validation section refs (Phase 6)
  const templateSectionRef = useRef<HTMLDivElement>(null);
  const industrySectionRef = useRef<HTMLDivElement>(null);

  const {
    review,
    visibleRewriteText,
    visibleIssues,
    visibleSources,
    finalRewriteText,
    playbackPhase,
    isPlaybackComplete,
    isLoading,
    error,
    currentSection,
    elapsedTime,
    sseProgress,
    requestSectionReview,
    clearReview,
  } = useESReview({ documentId });

  const hasSelectedCompany = companyReviewStatus !== "no_company_selected";
  const templateOptions = hasSelectedCompany
    ? [
        { value: "auto", label: "自動" },
        ...TEMPLATE_OPTIONS.map((option) => ({ value: option.value, label: option.label })),
      ]
    : TEMPLATE_OPTIONS.filter((option) => COMPANYLESS_TEMPLATE_TYPES.includes(option.value)).map(
        (option) => ({
          value: option.value,
          label: option.label,
        }),
      );

  const selectedTemplateFields = selectedTemplate ? TEMPLATE_EXTRA_FIELDS[selectedTemplate] : [];
  const requiresInternName = Boolean(
    selectedTemplate && TEMPLATE_EXTRA_FIELDS[selectedTemplate].includes("intern_name"),
  );
  const requiresIndustrySelection = hasSelectedCompany && Boolean(roleOptionsData?.requiresIndustrySelection);
  const needsExplicitTemplate = !hasSelectedCompany;
  const needsRoleSelection = hasSelectedCompany;
  const currentCharLimit = currentSection?.charLimit ?? sectionReviewRequest?.sectionCharLimit;
  const selectedRoleName = roleName.trim();
  const selectedTemplateValue = selectedTemplate ?? (hasSelectedCompany ? "auto" : "");
  const currentTemplateLabel = selectedTemplate
    ? TEMPLATE_LABELS[selectedTemplate]
    : hasSelectedCompany
      ? "自動判定"
      : undefined;
  const currentReviewModeLabel = getStandardESReviewModelLabel(selectedStandardModel);
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
    visibleRewriteText.trim() || visibleIssues.length > 0 || visibleSources.length > 0,
  );
  const hasResponse = isLoading || hasVisibleResults;
  const hasFinalResult = Boolean(review);
  const hasCompletedReview = hasFinalResult && isPlaybackComplete;
  const companyStatusDensity = hasResponse || Boolean(error) ? "compact" : "full";
  const showFooter = Boolean(sectionReviewRequest);
  const isCustomRoleActive = roleSelectionSource === "custom" && Boolean(customRoleInput.trim());
  const isTemplateSetupComplete =
    (!needsExplicitTemplate || Boolean(selectedTemplate)) && !missingTemplateField;
  const isRoleSetupComplete =
    !needsRoleSelection ||
    ((!requiresIndustrySelection || Boolean(selectedIndustry)) && Boolean(selectedRoleName));
  const creditCost = calculateESReviewCost(sectionReviewRequest?.sectionContent.length ?? 0);
  const isFooterLocked = isLoading || (hasResponse && !isPlaybackComplete);
  const reviewActionHint =
    !sectionReviewRequest?.sectionContent || sectionReviewRequest.sectionContent.length < 10
      ? "本文を10文字以上入力してください。"
      : !isTemplateSetupComplete && needsExplicitTemplate && !selectedTemplate
        ? "先に設問タイプを選択してください。"
        : !isTemplateSetupComplete && missingTemplateFieldLabel
          ? `${missingTemplateFieldLabel}を入力してください。`
          : isRoleOptionsLoading
            ? "職種候補を読み込んでいます。"
            : roleOptionsError
              ? "職種候補を取得できていません。再読み込みしてからお試しください。"
              : requiresIndustrySelection && !selectedIndustry
                ? "先に業界を選択してください。"
                : needsRoleSelection && !selectedRoleName
                  ? "先に職種を選択してください。"
                  : "準備できました。この設問をAI添削できます。";
  const canStartReview =
    Boolean(sectionReviewRequest?.sectionContent) &&
    (sectionReviewRequest?.sectionContent.length ?? 0) >= 10 &&
    isTemplateSetupComplete &&
    !isRoleOptionsLoading &&
    !roleOptionsError &&
    (!requiresIndustrySelection || Boolean(selectedIndustry)) &&
    (!needsRoleSelection || Boolean(selectedRoleName));
  const footerButtonLabel = error
    ? "この設問を再試行"
    : isFooterLocked
      ? "添削中..."
      : hasCompletedReview
        ? "条件を見直して再添削"
        : "この設問をAI添削";
  const footerHelperText = error
    ? "添削結果を表示できませんでした。もう一度お試しください。"
    : isFooterLocked
      ? "添削中です。完了までお待ちください。"
      : hasCompletedReview
        ? "前回の条件を保持したまま、設定を見直して再添削できます。"
        : canStartReview
          ? `${getStandardESReviewModelLabel(selectedStandardModel)} で実行します。800文字ごとに +1、最小2クレジットです。`
          : reviewActionHint;
  const footerActionDisabled = error ? false : isFooterLocked;

  useEffect(() => {
    if (!sectionReviewRequest) {
      return;
    }

    setSelectedTemplate(hasSelectedCompany ? null : COMPANYLESS_TEMPLATE_TYPES[0]);
    setInternName("");
  }, [hasSelectedCompany, sectionReviewRequest]);

  useEffect(() => {
    if (!hasSelectedCompany && selectedTemplate && !COMPANYLESS_TEMPLATE_TYPES.includes(selectedTemplate)) {
      setSelectedTemplate(COMPANYLESS_TEMPLATE_TYPES[0]);
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
      notifyReviewComplete(companyReviewStatus === "ready_for_es_review");
      setHasShownCompletionToast(true);
    }
  }, [companyReviewStatus, hasShownCompletionToast, isPlaybackComplete, review]);

  useEffect(() => {
    if (!hasResponse) {
      setHasShownCompletionToast(false);
    }
  }, [hasResponse]);

  // Phase 5: Detect manual scroll to stop auto-follow
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const handleScroll = () => {
      if (lastProgrammaticScrollRef.current) {
        lastProgrammaticScrollRef.current = false;
        return;
      }
      userHasScrolledRef.current = true;
    };
    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => container.removeEventListener("scroll", handleScroll);
  }, []);

  // Phase 5: Auto-scroll following streaming content growth
  useEffect(() => {
    if (userHasScrolledRef.current || !hasResponse) return;
    const container = scrollContainerRef.current;
    if (!container) return;
    lastProgrammaticScrollRef.current = true;
    container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
  }, [visibleRewriteText, visibleIssues.length, visibleSources.length, hasResponse]);

  // Phase 6: Clear validation errors when user fixes settings
  useEffect(() => {
    if (isTemplateSetupComplete) {
      setValidationErrors((prev) => {
        if (!prev.has("template")) return prev;
        const next = new Set(prev);
        next.delete("template");
        return next;
      });
    }
  }, [isTemplateSetupComplete]);

  useEffect(() => {
    if (isRoleSetupComplete) {
      setValidationErrors((prev) => {
        if (!prev.has("industry")) return prev;
        const next = new Set(prev);
        next.delete("industry");
        return next;
      });
    }
  }, [isRoleSetupComplete]);

  const handleSectionReview = useCallback(async () => {
    if (!sectionReviewRequest) {
      return;
    }
    if (!acquireLock("ES添削を実行中")) {
      return;
    }

    try {
      setResponseInstanceKey((prev) => prev + 1);
      setHasShownCompletionToast(false);
      scrollContainerRef.current?.scrollTo({ top: 0, behavior: "smooth" });
      userHasScrolledRef.current = false;
      await requestSectionReview({
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
        llmModel: selectedStandardModel,
      });
    } finally {
      releaseLock();
    }
  }, [
    acquireLock,
    companyId,
    companyReviewStatus,
    internName,
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
    // Phase 6: Validate settings before starting review
    if (!canStartReview) {
      const errors = new Set<string>();
      if (!isTemplateSetupComplete) errors.add("template");
      if (!isRoleSetupComplete) errors.add("industry");
      setValidationErrors(errors);
      // Scroll to first error section
      const firstRef = errors.has("template")
        ? templateSectionRef
        : errors.has("industry")
          ? industrySectionRef
          : null;
      firstRef?.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    setValidationErrors(new Set());
    await handleSectionReview();
  }, [canStartReview, clearReview, handleSectionReview, hasCompletedReview, isRoleSetupComplete, isTemplateSetupComplete]);

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
    clearReview();
    onClearSectionReview?.();
  }, [clearReview, onClearSectionReview]);

  return (
    <div className={cn("flex min-h-0 flex-col", className)}>
      <div ref={scrollContainerRef} className="min-h-0 flex-1 overflow-y-auto">
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
              <div className="rounded-[26px] border border-border/70 bg-background p-4 shadow-sm">
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
                        改善案、改善ポイント、出典リンクをこの順で表示します。
                      </p>
                    </div>
                  </div>

                  {sectionReviewRequest.sectionCharLimit ? (
                    <Badge variant="soft-info" className="px-3 py-1 text-[11px]">
                      {sectionReviewRequest.sectionCharLimit}字上限
                    </Badge>
                  ) : null}
                </div>

                <div className="mt-4 rounded-[22px] border border-border/60 bg-background/85 px-4 py-3">
                  <p className="line-clamp-5 whitespace-pre-wrap text-sm leading-7 text-foreground/88">
                    {sectionReviewRequest.sectionContent}
                  </p>
                </div>
              </div>

              <div
                ref={templateSectionRef}
                className={cn(
                  "rounded-[26px] border bg-background/90 p-4 shadow-[0_10px_30px_rgba(15,23,42,0.05)]",
                  validationErrors.has("template")
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
                        : "企業未選択では、企業に依存しない設問タイプだけ選択できます。"}
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
                      : hasSelectedCompany
                        ? "自動判定では設問文から最適な型を推定します。"
                        : "この設問に近い型をひとつ選んでください。"}
                  </p>
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
                        <SetupField
                          key={fieldName}
                          label={EXTRA_FIELD_LABELS[fieldName] ?? fieldName}
                          placeholder={
                            fieldName === "intern_name"
                              ? "例: 夏季インターン"
                              : "例: エンジニアコース"
                          }
                          value={fieldName === "intern_name" ? internName : roleName}
                          onChange={fieldName === "intern_name" ? setInternName : setRoleName}
                        />
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>

              <ReviewModeSelector
                standardModel={selectedStandardModel}
                onStandardModelChange={setSelectedStandardModel}
              />

              {hasSelectedCompany ? (
                <div
                  ref={industrySectionRef}
                  className={cn(
                    "rounded-[26px] border bg-background/90 p-4 shadow-[0_10px_30px_rgba(15,23,42,0.05)]",
                    validationErrors.has("industry")
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
                          <SelectTrigger className="mt-3 h-11 rounded-2xl">
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
                      </div>

                      <div className="space-y-2 rounded-[22px] border border-border/60 bg-background/85 p-4">
                        <p className="text-sm font-semibold text-foreground">職種を選択してください</p>
                        <p className="text-xs leading-5 text-muted-foreground">
                          {selectedIndustry
                            ? "候補から選び、見つからない場合だけ自由入力を使ってください。"
                            : "先に業界を選ぶと、この企業向けの職種候補を表示します。"}
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
                          <SelectTrigger className="mt-3 h-11 rounded-2xl">
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

                        {selectedIndustry && roleOptionsData.roleGroups.length === 0 ? (
                          <p className="text-xs text-muted-foreground">
                            候補がないため、下の自由入力欄から職種を指定してください。
                          </p>
                        ) : null}
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
                finalRewriteText={finalRewriteText}
                issues={visibleIssues}
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
                reviewMode={reviewMode}
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
          helperText={footerHelperText}
          buttonLabel={footerButtonLabel}
          disabled={footerActionDisabled}
          onClick={handleReviewFooterAction}
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
