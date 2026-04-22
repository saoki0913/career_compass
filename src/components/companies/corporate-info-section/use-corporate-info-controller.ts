"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { useAuth } from "@/components/auth/AuthProvider";
import { parseApiErrorResponse, toAppUiError } from "@/lib/api-errors";
import { getRagPdfIngestPolicySummaryJa } from "@/lib/company-info/pdf-ingest-limits";
import { useCredits } from "@/hooks/useCredits";
import { useOperationLock } from "@/hooks/useOperationLock";
import { notifyUserFacingAppError } from "@/lib/client-error-ui";
import type { ContentType } from "@/lib/company-info/sources";

import { deleteCorporateUrls, fetchCorporateInfoStatus } from "./client-api";
import { parseUrlListInput, pdfFileKey } from "./workflow-helpers";
import {
  type CorporateInfoStatus,
  type FetchResult,
  type InputMode,
  type ModalStep,
  type PdfDraft,
  type UrlDraft,
  type WebDraft,
  CONTENT_TYPE_TO_CHANNEL,
  mapLegacyToNew,
  createInitialPdfDraft,
  createInitialUrlDraft,
  createInitialWebDraft,
} from "./workflow-config";
import { useCorporateSearch } from "./use-corporate-search";
import { useFetchCorporateInfo } from "./use-fetch-corporate-info";
import { usePdfUpload } from "./use-pdf-upload";

// --- Pure helper functions (exported for sub-hooks) ---

const IR_SEARCH_KEYWORDS = [
  "有価証券報告書",
  "有報",
  "統合報告書",
  "統合報告",
  "決算説明資料",
  "決算短信",
  "ir",
  "投資家",
  "株主",
  "財務",
  "annual report",
  "securities report",
  "yuho",
];

const BUSINESS_SEARCH_KEYWORDS = [
  "事業内容",
  "事業紹介",
  "製品",
  "サービス",
  "ソリューション",
  "business",
  "service",
  "product",
];

export function buildCorporateSearchQuery(companyName: string, input: string) {
  const trimmed = input.trim();
  if (!trimmed) return "";
  if (trimmed.toLowerCase().includes(companyName.toLowerCase())) {
    return trimmed;
  }
  return `${companyName} ${trimmed}`;
}

export function detectCorporateContentType(companyName: string, input: string): ContentType {
  const withoutCompany = input.split(companyName).join("");
  const compact = withoutCompany.toLowerCase().replace(/[\s　]+/g, "");
  const hasKeyword = (keywords: string[]) =>
    keywords.some((kw) => compact.includes(kw.toLowerCase().replace(/[\s　]+/g, "")));

  if (hasKeyword(IR_SEARCH_KEYWORDS)) {
    return "ir_materials";
  }
  if (hasKeyword(BUSINESS_SEARCH_KEYWORDS)) {
    return "corporate_site";
  }
  return "corporate_site";
}

export function resolveCorporateContentChannel(
  contentType?: ContentType | null,
): "corporate_ir" | "corporate_general" {
  if (!contentType) {
    return "corporate_general";
  }
  return CONTENT_TYPE_TO_CHANNEL[contentType] || "corporate_general";
}

// --- Controller hook ---

interface CorporateInfoSectionControllerArgs {
  companyId: string;
  companyName: string;
  onUpdate?: () => void;
}

export function useCorporateInfoSectionController({
  companyId,
  companyName,
  onUpdate,
}: CorporateInfoSectionControllerArgs) {
  const { isAuthenticated, isReady: isAuthReady } = useAuth();
  const {
    companyRagUnitsLimit: companyRagHtmlPagesLimit,
    companyRagUnitsRemaining: companyRagHtmlPagesRemaining,
    companyRagPdfPagesLimit,
    companyRagPdfPagesRemaining,
    plan,
    ragPdfLimits,
  } = useCredits({ isAuthenticated, isAuthReady });
  const { isLocked, acquireLock, releaseLock } = useOperationLock();

  // --- Core state ---
  const [status, setStatus] = useState<CorporateInfoStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [showUrlModal, setShowUrlModal] = useState(false);
  const [showRagModal, setShowRagModal] = useState(false);
  const [webDraft, setWebDraft] = useState<WebDraft>(createInitialWebDraft);
  const [urlDraft, setUrlDraft] = useState<UrlDraft>(createInitialUrlDraft);
  const [pdfDraft, setPdfDraft] = useState<PdfDraft>(createInitialPdfDraft);
  const [fetchResult, setFetchResult] = useState<FetchResult | null>(null);
  const [displayedStep, setDisplayedStep] = useState<ModalStep>("configure");
  const [isStepTransitioning, setIsStepTransitioning] = useState(false);
  const [selectedUrlsForDelete, setSelectedUrlsForDelete] = useState<Set<string>>(new Set());
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [inputMode, setInputMode] = useState<InputMode>("web");
  const [modalStep, setModalStep] = useState<ModalStep>("configure");

  // --- fetchStatus ---
  const fetchStatus = useCallback(
    async (background = false) => {
      try {
        if (!background) setIsLoading(true);
        const response = await fetchCorporateInfoStatus(companyId);
        if (!response.ok) {
          throw await parseApiErrorResponse(
            response,
            {
              code: "CORPORATE_STATUS_FETCH_FAILED",
              userMessage: "企業情報の状態を読み込めませんでした。",
              action: "ページを再読み込みして、もう一度お試しください。",
              retryable: true,
            },
            "CorporateInfoSection.fetchStatus",
          );
        }
        const data = await response.json();
        setStatus(data);
      } catch (err) {
        const uiError = toAppUiError(
          err,
          {
            code: "CORPORATE_STATUS_FETCH_FAILED",
            userMessage: "企業情報の状態を読み込めませんでした。",
            action: "ページを再読み込みして、もう一度お試しください。",
            retryable: true,
          },
          "CorporateInfoSection.fetchStatus",
        );
        setError(uiError.message);
        notifyUserFacingAppError(uiError);
      } finally {
        if (!background) setIsLoading(false);
      }
    },
    [companyId],
  );

  useEffect(() => { void fetchStatus(); }, [fetchStatus]);

  const hasPendingPdfJobs = useMemo(
    () =>
      status?.corporateInfoUrls?.some(
        (entry) => entry.status === "pending" || entry.status === "processing",
      ) ?? false,
    [status?.corporateInfoUrls],
  );

  useEffect(() => {
    if (!hasPendingPdfJobs) return;
    const timer = window.setInterval(() => { void fetchStatus(true); }, 10_000);
    return () => window.clearInterval(timer);
  }, [fetchStatus, hasPendingPdfJobs]);

  // --- Modal helpers (closeModal defined early so sub-hooks can use it) ---
  const closeModal = useCallback(() => {
    setShowModal(false);
    setModalStep("configure");
    setDisplayedStep("configure");
    setIsStepTransitioning(false);
    setFetchResult(null);
    setError(null);
  }, []);

  const openModal = useCallback(() => {
    setShowModal(true);
    setModalStep("configure");
    setDisplayedStep("configure");
    setIsStepTransitioning(false);
    setWebDraft(createInitialWebDraft());
    setUrlDraft(createInitialUrlDraft());
    setPdfDraft(createInitialPdfDraft());
    setFetchResult(null);
    setError(null);
    setInputMode("web");
  }, []);

  const openUrlModal = useCallback(() => {
    setShowUrlModal(true);
    setSelectedUrlsForDelete(new Set());
    setDeleteError(null);
    setShowDeleteConfirm(false);
  }, []);

  const closeUrlModal = useCallback(() => {
    setShowUrlModal(false);
    setSelectedUrlsForDelete(new Set());
    setDeleteError(null);
    setShowDeleteConfirm(false);
  }, []);

  const closeRagModal = useCallback(() => { setShowRagModal(false); }, []);

  // --- Derived values needed by sub-hooks ---
  const parsedCustomUrls = useMemo(
    () => parseUrlListInput(urlDraft.customUrlInput),
    [urlDraft.customUrlInput],
  );
  const resolvedWebContentType = webDraft.lastContentType || webDraft.selectedContentType;

  // --- Sub-hooks (called unconditionally at top level per React rules) ---
  const { isSearching, handleTypeSearch, handleCustomSearch } = useCorporateSearch({
    companyId,
    companyName,
    acquireLock,
    releaseLock,
    webDraft,
    setWebDraft,
    setError,
    setModalStep,
  });

  const { isFetching, handleFetchCorporateInfo } = useFetchCorporateInfo({
    companyId,
    companyRagHtmlPagesRemaining,
    companyRagPdfPagesRemaining,
    webDraft,
    inputMode,
    parsedCustomUrls,
    resolvedWebContentType,
    acquireLock,
    releaseLock,
    fetchStatus,
    closeModal,
    setError,
    setFetchResult,
    setModalStep,
  });

  const {
    isUploading,
    pdfUploadProgress,
    setPdfUploadProgress,
    pdfPageEstimates,
    pdfEstimate,
    pdfEstimateLoading,
    handleUploadPdf,
  } = usePdfUpload({
    companyId,
    companyRagPdfPagesRemaining,
    pdfDraft,
    acquireLock,
    releaseLock,
    fetchStatus,
    closeModal,
    setError,
    setFetchResult,
    setModalStep,
    setDisplayedStep,
    setIsStepTransitioning,
  });

  // --- Remaining derived state ---
  const urlCountsByType = useMemo(() => {
    if (!status?.corporateInfoUrls) return {} as Record<ContentType, number>;
    const counts: Record<ContentType, number> = {
      new_grad_recruitment: 0,
      midcareer_recruitment: 0,
      corporate_site: 0,
      ir_materials: 0,
      ceo_message: 0,
      employee_interviews: 0,
      press_release: 0,
      csr_sustainability: 0,
      midterm_plan: 0,
    };
    for (const url of status.corporateInfoUrls) {
      const type = url.contentType || (url.type ? mapLegacyToNew(url.type) : null);
      if (!type) continue;
      counts[type] = (counts[type] || 0) + 1;
      if (Array.isArray(url.secondaryContentTypes)) {
        for (const secondary of url.secondaryContentTypes) {
          counts[secondary] = (counts[secondary] || 0) + 1;
        }
      }
    }
    return counts;
  }, [status?.corporateInfoUrls]);

  const sourceStatusCounts = useMemo(() => {
    if (!status?.corporateInfoUrls) return { pending: 0, processing: 0, failed: 0 };
    return status.corporateInfoUrls.reduce(
      (acc, source) => {
        if (source.status === "pending") acc.pending += 1;
        if (source.status === "processing") acc.processing += 1;
        if (source.status === "failed") acc.failed += 1;
        return acc;
      },
      { pending: 0, processing: 0, failed: 0 },
    );
  }, [status?.corporateInfoUrls]);

  const orderedCandidates = useMemo(
    () => [
      ...webDraft.candidates.filter(
        (c) => c.sourceType === "official" && c.confidence === "high",
      ),
      ...webDraft.candidates.filter(
        (c) => !(c.sourceType === "official" && c.confidence === "high"),
      ),
    ],
    [webDraft.candidates],
  );
  const allCandidateUrls = useMemo(
    () => webDraft.candidates.map((c) => c.url),
    [webDraft.candidates],
  );

  const activeModalStep: ModalStep = fetchResult ? "result" : modalStep;
  const isResultDisplayed = displayedStep === "result";
  const showWebReviewStep = inputMode === "web" && activeModalStep === "review";
  const showConfigureStep = activeModalStep === "configure";
  const isModalBusy = isSearching || isFetching || isUploading;
  const hasReviewContext = webDraft.hasSearched || webDraft.candidates.length > 0;
  const ragStatus = status?.ragStatus;
  const hasAnyData = Boolean(status?.corporateInfoUrls && status.corporateInfoUrls.length > 0);
  const totalSources = status?.corporateInfoUrls?.length || 0;
  const pageLimit = status?.pageLimit || 0;
  const sourceUsagePercent = Math.min((totalSources / Math.max(pageLimit, 1)) * 100, 100);
  const shouldShowRagAllowance = isAuthenticated && plan !== "guest";
  const ragUnitUsagePercent =
    shouldShowRagAllowance && companyRagHtmlPagesLimit > 0
      ? Math.min(
          ((companyRagHtmlPagesLimit - Math.max(companyRagHtmlPagesRemaining, 0)) /
            Math.max(companyRagHtmlPagesLimit, 1)) *
            100,
          100,
        )
      : 0;
  const lastUpdatedLabel = ragStatus?.lastUpdated
    ? new Date(ragStatus.lastUpdated).toLocaleDateString("ja-JP", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;
  const pdfUploadInputId = `pdf-upload-input-${companyId}`;
  const paidPdfPlan = plan === "standard" || plan === "pro" ? plan : "free";
  const ragPdfPolicySummaryJa =
    ragPdfLimits?.summaryJa ?? getRagPdfIngestPolicySummaryJa(paidPdfPlan);

  // --- Step navigation ---
  const isStepNavigable = useCallback(
    (step: ModalStep) => {
      if (isModalBusy) return false;
      switch (step) {
        case "configure": return true;
        case "review": return hasReviewContext;
        case "result": return activeModalStep === "result";
        default: return false;
      }
    },
    [activeModalStep, hasReviewContext, isModalBusy],
  );

  const handleStepNavigation = useCallback(
    (step: ModalStep) => {
      if (!isStepNavigable(step) || step === activeModalStep) return;
      if (step !== "result" && fetchResult) setFetchResult(null);
      if (step === "review") {
        setInputMode("web");
        setWebDraft((prev) => ({ ...prev, step: "review" }));
        setModalStep("review");
        return;
      }
      if (step === "configure" && inputMode === "web") {
        setWebDraft((prev) => ({ ...prev, step: "configure" }));
      }
      setModalStep(step);
    },
    [activeModalStep, fetchResult, inputMode, isStepNavigable],
  );

  const handleModeSwitch = useCallback(
    (mode: InputMode) => {
      if (mode === inputMode) return;
      if (inputMode === "web" && activeModalStep !== "result") {
        setWebDraft((prev) => ({
          ...prev,
          step: activeModalStep === "review" ? "review" : "configure",
        }));
      }
      setInputMode(mode);
      setError(null);
      setModalStep(mode === "web" ? webDraft.step : "configure");
    },
    [activeModalStep, inputMode, webDraft.step],
  );

  // --- URL / delete helpers ---
  const toggleUrl = useCallback((url: string) => {
    setWebDraft((prev) => ({
      ...prev,
      selectedUrls: prev.selectedUrls.includes(url)
        ? prev.selectedUrls.filter((u) => u !== url)
        : [...prev.selectedUrls, url],
    }));
  }, []);

  const toggleUrlForDelete = useCallback((url: string) => {
    setSelectedUrlsForDelete((prev) => {
      const next = new Set(prev);
      if (next.has(url)) { next.delete(url); } else { next.add(url); }
      return next;
    });
  }, []);

  const toggleSelectAllForDelete = useCallback(() => {
    if (!status?.corporateInfoUrls) return;
    const allUrls = status.corporateInfoUrls.map((u) => u.url);
    if (selectedUrlsForDelete.size === allUrls.length) {
      setSelectedUrlsForDelete(new Set());
    } else {
      setSelectedUrlsForDelete(new Set(allUrls));
    }
  }, [selectedUrlsForDelete.size, status?.corporateInfoUrls]);

  const handleDeleteUrls = useCallback(async () => {
    if (selectedUrlsForDelete.size === 0) return;
    if (!acquireLock("RAGデータを削除中")) return;
    setIsDeleting(true);
    setDeleteError(null);
    try {
      const response = await deleteCorporateUrls(companyId, Array.from(selectedUrlsForDelete));
      if (!response.ok) {
        throw await parseApiErrorResponse(
          response,
          {
            code: "CORPORATE_URL_DELETE_FAILED",
            userMessage: "企業情報を削除できませんでした。",
            action: "時間を置いて、もう一度お試しください。",
            retryable: true,
          },
          "CorporateInfoSection.handleDeleteUrls",
        );
      }
      await fetchStatus();
      onUpdate?.();
      setSelectedUrlsForDelete(new Set());
      setShowDeleteConfirm(false);
    } catch (err) {
      const uiError = toAppUiError(
        err,
        {
          code: "CORPORATE_URL_DELETE_FAILED",
          userMessage: "企業情報を削除できませんでした。",
          action: "時間を置いて、もう一度お試しください。",
          retryable: true,
        },
        "CorporateInfoSection.handleDeleteUrls",
      );
      setDeleteError(uiError.message);
      notifyUserFacingAppError(uiError);
    } finally {
      setIsDeleting(false);
      releaseLock();
    }
  }, [acquireLock, companyId, fetchStatus, onUpdate, releaseLock, selectedUrlsForDelete]);

  return {
    isAuthenticated,
    isAuthReady,
    plan,
    companyRagHtmlPagesLimit,
    companyRagHtmlPagesRemaining,
    companyRagPdfPagesLimit,
    companyRagPdfPagesRemaining,
    ragPdfPolicySummaryJa,
    isLocked,
    status,
    isLoading,
    error,
    showModal,
    showUrlModal,
    showRagModal,
    isSearching,
    isFetching,
    webDraft,
    urlDraft,
    pdfDraft,
    fetchResult,
    isUploading,
    pdfUploadProgress,
    pdfPageEstimates,
    pdfEstimate,
    pdfEstimateLoading,
    displayedStep,
    isStepTransitioning,
    selectedUrlsForDelete,
    showDeleteConfirm,
    isDeleting,
    deleteError,
    inputMode,
    modalStep,
    urlCountsByType,
    sourceStatusCounts,
    parsedCustomUrls,
    orderedCandidates,
    allCandidateUrls,
    resolvedWebContentType,
    activeModalStep,
    isResultDisplayed,
    showWebReviewStep,
    showConfigureStep,
    isModalBusy,
    hasReviewContext,
    hasPendingPdfJobs,
    ragStatus,
    hasAnyData,
    totalSources,
    pageLimit,
    sourceUsagePercent,
    shouldShowRagAllowance,
    ragUnitUsagePercent,
    lastUpdatedLabel,
    pdfUploadInputId,
    isStepNavigable,
    handleStepNavigation,
    openModal,
    closeModal,
    openUrlModal,
    closeUrlModal,
    closeRagModal,
    handleTypeSearch,
    handleCustomSearch,
    handleFetchCorporateInfo,
    handleUploadPdf,
    handleModeSwitch,
    toggleUrl,
    toggleUrlForDelete,
    toggleSelectAllForDelete,
    handleDeleteUrls,
    setShowDeleteConfirm,
    setShowRagModal,
    setShowModal,
    setShowUrlModal,
    setIsStepTransitioning,
    setDisplayedStep,
    setPdfUploadProgress,
    setWebDraft,
    setUrlDraft,
    setPdfDraft,
    setError,
    setInputMode,
    setModalStep,
    fetchStatus,
  };
}
