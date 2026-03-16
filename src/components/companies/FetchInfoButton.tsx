"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { getDeviceToken } from "@/lib/auth/device-token";
import { ProcessingSteps, COMPANY_FETCH_STEPS } from "@/components/ui/ProcessingSteps";
import { useOperationLock } from "@/hooks/useOperationLock";
import { notifySuccess } from "@/lib/notifications";
import { parseApiErrorResponse, toAppUiError } from "@/lib/api-errors";
import {
  CONFIDENCE_BADGE_COLORS,
  INTEGRATED_BADGE_LABELS,
  normalizeSourceConfidence,
} from "@/lib/company-info/source-badges";

type SelectionType = "main_selection" | "internship";
type SelectionTypeState = SelectionType | null;

interface FetchInfoButtonProps {
  companyId: string;
  companyName: string;
  hasRecruitmentUrl: boolean;
  onSuccess?: () => void;
}

interface SearchCandidate {
  url: string;
  title: string;
  confidence: "high" | "medium" | "low";
  sourceType: "official" | "job_site" | "subsidiary" | "parent" | "blog" | "other";
  relationCompanyName?: string | null;
}

interface SearchPagesResponse {
  candidates: SearchCandidate[];
  usedGraduationYear: number | null;
  yearSource: "profile" | "manual" | "none";
}

interface DeadlineSummary {
  id: string;
  title: string;
  type: string;
  dueDate: string;
  sourceUrl?: string | null;
  isDuplicate?: boolean;
}

type FetchResultStatus = "success" | "duplicates_only" | "no_deadlines" | "error";
type ModalStep = "selection" | "candidates" | "result";

interface FetchResult {
  success: boolean;
  resultStatus: FetchResultStatus;
  data?: {
    deadlinesCount: number;
    deadlineIds: string[];
    duplicatesSkipped?: number;
    duplicateIds?: string[];
    applicationMethod: string | null;
    requiredDocuments: string[];
    selectionProcess: string | null;
  };
  deadlines?: DeadlineSummary[];
  error?: string;
  message?: string;
  deadlinesExtractedCount?: number;
  deadlinesSavedCount?: number;
  creditsConsumed: number;
  freeUsed: boolean;
  freeRemaining: number;
}

// Icons
const SparklesIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"
    />
  </svg>
);

const LoadingSpinner = () => (
  <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path
      className="opacity-75"
      fill="currentColor"
      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
    />
  </svg>
);

const CheckIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
  </svg>
);

const XIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
  </svg>
);

function buildHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (typeof window !== "undefined") {
    try {
      const deviceToken = getDeviceToken();
      if (deviceToken) {
        headers["x-device-token"] = deviceToken;
      }
    } catch {
      // Ignore
    }
  }
  return headers;
}

export function FetchInfoButton({
  companyId,
  companyName,
  hasRecruitmentUrl,
  onSuccess,
}: FetchInfoButtonProps) {
  const { isLocked, acquireLock, releaseLock } = useOperationLock();
  const currentYear = new Date().getFullYear();
  const graduationYearOptions = Array.from({ length: 7 }, (_, index) => currentYear + index);
  const [showModal, setShowModal] = useState(false);
  const [modalStep, setModalStep] = useState<ModalStep>("selection");
  const [isFetching, setIsFetching] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [candidates, setCandidates] = useState<SearchCandidate[]>([]);
  const [selectedUrls, setSelectedUrls] = useState<string[]>([]);
  const [customUrl, setCustomUrl] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [result, setResult] = useState<FetchResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Progress tracking for sequential URL processing
  const [fetchProgress, setFetchProgress] = useState<{ current: number; total: number } | null>(null);
  // Selection type filter (main_selection / internship) - required for accurate search
  const [selectionType, setSelectionType] = useState<SelectionTypeState>(null);
  // User's graduation year from profile
  const [graduationYear, setGraduationYear] = useState<number | null>(null);
  // Graduation year input shown in the modal. Profile year is the initial value but can be overridden.
  const [graduationYearInput, setGraduationYearInput] = useState<string>("");
  // Graduation year resolved for the current search/fetch flow
  const [activeGraduationYear, setActiveGraduationYear] = useState<number | null>(null);
  const [activeYearSource, setActiveYearSource] = useState<SearchPagesResponse["yearSource"]>("none");
  // Whether the current search used relaxed (snippet) matching
  const [isRelaxedSearch, setIsRelaxedSearch] = useState(false);

  // Fetch user's graduation year on mount
  useEffect(() => {
    async function fetchUserProfile() {
      try {
        const response = await fetch("/api/settings/profile", {
          headers: buildHeaders(),
          credentials: "include",
        });
        if (response.ok) {
          const data = await response.json();
          setGraduationYear(data.profile?.graduationYear || null);
        }
      } catch {
        // Ignore - guest users won't have a profile
      }
    }
    fetchUserProfile();
  }, []);

  useEffect(() => {
    if (!graduationYearInput) {
      setGraduationYearInput(graduationYear ? String(graduationYear) : "");
    }
    if (!activeGraduationYear) {
      setActiveGraduationYear(graduationYear);
    }
    if (activeYearSource === "none" && graduationYear) {
      setActiveYearSource("profile");
    }
  }, [graduationYear, graduationYearInput, activeGraduationYear, activeYearSource]);

  const resolveGraduationYear = () => {
    const parsed = Number.parseInt(graduationYearInput, 10);
    return Number.isFinite(parsed) ? parsed : null;
  };

  const getRequestedGraduationYear = () => {
    const resolved = resolveGraduationYear();
    if (!resolved) return undefined;
    if (graduationYear && resolved === graduationYear) {
      return undefined;
    }
    return resolved;
  };

  const resetTransientState = () => {
    setModalStep("selection");
    setCandidates([]);
    setSelectedUrls([]);
    setCustomUrl("");
    setSearchQuery("");
    setResult(null);
    setError(null);
    setFetchProgress(null);
    setSelectionType(null);
    setGraduationYearInput(graduationYear ? String(graduationYear) : "");
    setActiveGraduationYear(graduationYear);
    setActiveYearSource(graduationYear ? "profile" : "none");
    setIsRelaxedSearch(false);
  };

  const openModal = () => {
    resetTransientState();
    setShowModal(true);
  };

  const closeModal = () => {
    if (isSearching || isFetching) return;
    setShowModal(false);
    resetTransientState();
  };

  const handleSearchPages = async (customQueryOverride?: string, allowSnippetMatch = false) => {
    if (!selectionType) {
      setError("選考タイプを選択してください");
      setModalStep("selection");
      return;
    }

    const resolvedGraduationYear = resolveGraduationYear();
    if (!resolvedGraduationYear) {
      setError("卒業年度を選択してください");
      setModalStep("selection");
      return;
    }

    if (!acquireLock("採用情報を検索中")) return;
    setIsSearching(true);
    setModalStep("candidates");
    setError(null);
    setResult(null);
    setIsRelaxedSearch(allowSnippetMatch);

    const queryToUse = customQueryOverride ?? searchQuery;
    const requestedGraduationYear = getRequestedGraduationYear();

    try {
      const response = await fetch(`/api/companies/${companyId}/search-pages`, {
        method: "POST",
        headers: buildHeaders(),
        credentials: "include",
        body: JSON.stringify({
          customQuery: queryToUse || undefined,
          selectionType: selectionType || undefined,
          allowSnippetMatch,
          graduationYear: requestedGraduationYear,
        }),
      });

      if (!response.ok) {
        throw await parseApiErrorResponse(
          response,
          {
            code: "SEARCH_PAGES_FAILED",
            userMessage: "候補URLを検索できませんでした。",
            action: "条件を見直して、もう一度お試しください。",
            retryable: true,
          },
          "FetchInfoButton.handleSearchPages"
        );
      }

      const data: SearchPagesResponse = await response.json();
      setCandidates(data.candidates);
      setActiveGraduationYear(data.usedGraduationYear ?? resolvedGraduationYear);
      setActiveYearSource(data.yearSource);

      // Default: select existing URL and high-confidence candidates
      const defaultSelections: string[] = [];
      if (hasRecruitmentUrl) {
        defaultSelections.push("existing");
      }
      // Auto-select only (official, high) candidates
      data.candidates.forEach((c) => {
        if (c.sourceType === "official" && c.confidence === "high") {
          defaultSelections.push(c.url);
        }
      });
      setSelectedUrls(defaultSelections);
    } catch (err) {
      const uiError = toAppUiError(
        err,
        {
          code: "SEARCH_PAGES_FAILED",
          userMessage: "候補URLを検索できませんでした。",
          action: "条件を見直して、もう一度お試しください。",
          retryable: true,
        },
        "FetchInfoButton.handleSearchPages"
      );
      setError(uiError.message);
      setCandidates([]);
      setSelectedUrls([]);
    } finally {
      setIsSearching(false);
      releaseLock();
    }
  };

  const handleConfirmUrl = async () => {
    if (!acquireLock("採用情報を取得中")) return;
    // Build list of URLs to fetch
    const urlsToFetch: string[] = [];

    for (const selected of selectedUrls) {
      if (selected === "existing" && hasRecruitmentUrl) {
        urlsToFetch.push(""); // Empty string means use existing URL
      } else if (selected !== "custom") {
        urlsToFetch.push(selected);
      }
    }

    // Add custom URL if selected
    if (selectedUrls.includes("custom")) {
      if (!customUrl.trim()) {
        setError("カスタムURLを入力してください");
        releaseLock();
        return;
      }
      urlsToFetch.push(customUrl.trim());
    }

    if (urlsToFetch.length === 0) {
      setError("URLを選択してください");
      releaseLock();
      return;
    }

    // Sequential processing with progress tracking
    setModalStep("candidates");
    setIsFetching(true);
    setError(null);
    setFetchProgress({ current: 0, total: urlsToFetch.length });

    // Aggregated results
    let totalDeadlinesCount = 0;
    let totalDuplicatesSkipped = 0;
    const allDeadlineIds: string[] = [];
    const allDuplicateIds: string[] = [];
    const allDeadlines: DeadlineSummary[] = [];
    let applicationMethod: string | null = null;
    const requiredDocuments: string[] = [];
    let selectionProcess: string | null = null;
    let totalCreditsConsumed = 0;
    let freeUsed = false;
    let freeRemaining = 0;
    let totalDeadlinesExtractedCount = 0;
    let totalDeadlinesSavedCount = 0;
    const errors: string[] = [];
    let anySuccess = false;
    let sawNoDeadlines = false;
    let sawDuplicatesOnly = false;

    for (let i = 0; i < urlsToFetch.length; i++) {
      const url = urlsToFetch[i];
      try {
        const response = await fetch(`/api/companies/${companyId}/fetch-info`, {
          method: "POST",
          headers: buildHeaders(),
          credentials: "include",
          body: JSON.stringify({
            url,
            selectionType: selectionType || undefined,
            graduationYear: activeGraduationYear || resolveGraduationYear() || undefined,
          }),
        });

        if (response.status === 402) {
          const uiError = await parseApiErrorResponse(
            response,
            {
              code: "FETCH_INFO_LIMIT_REACHED",
              userMessage: "この操作は現在利用できませんでした。",
              action: "プランや残高を確認して、もう一度お試しください。",
            },
            "FetchInfoButton.handleConfirmUrl"
          );
          errors.push(uiError.message);
          continue;
        }

        if (!response.ok) {
          const uiError = await parseApiErrorResponse(
            response,
            {
              code: "FETCH_INFO_FAILED",
              userMessage: `URL ${i + 1} の取得に失敗しました。`,
              action: "URLや設定を確認して、もう一度お試しください。",
              retryable: true,
            },
            "FetchInfoButton.handleConfirmUrl"
          );
          errors.push(uiError.message);
          continue;
        }

        const data: FetchResult = await response.json();
        totalDeadlinesExtractedCount += data.deadlinesExtractedCount || 0;
        totalDeadlinesSavedCount += data.deadlinesSavedCount || data.data?.deadlinesCount || 0;
        if (data.resultStatus === "no_deadlines") {
          sawNoDeadlines = true;
        }
        if (data.resultStatus === "duplicates_only") {
          sawDuplicatesOnly = true;
        }

        if (data.success && data.data) {
          anySuccess = true;
          totalDeadlinesCount += data.data.deadlinesCount || 0;
          allDeadlineIds.push(...(data.data.deadlineIds || []));
          if (data.deadlines) {
            allDeadlines.push(...data.deadlines);
          }
        }

        if (data.data) {
          totalDuplicatesSkipped += data.data.duplicatesSkipped || 0;
          allDuplicateIds.push(...(data.data.duplicateIds || []));
          if (!applicationMethod && data.data.applicationMethod) {
            applicationMethod = data.data.applicationMethod;
          }
          if (data.data.requiredDocuments) {
            for (const doc of data.data.requiredDocuments) {
              if (!requiredDocuments.includes(doc)) {
                requiredDocuments.push(doc);
              }
            }
          }
          if (!selectionProcess && data.data.selectionProcess) {
            selectionProcess = data.data.selectionProcess;
          }
        }

        totalCreditsConsumed += data.creditsConsumed || 0;
        freeUsed = freeUsed || data.freeUsed;
        freeRemaining = data.freeRemaining;
        if (data.error) {
          const uiError = toAppUiError(
            data.error,
            {
              code: "FETCH_INFO_PARTIAL_ERROR",
              userMessage: `URL ${i + 1} の取得で一部処理が完了しませんでした。`,
              action: "必要に応じて候補URLを見直し、再試行してください。",
            },
            "FetchInfoButton.handleConfirmUrl.result"
          );
          errors.push(uiError.message);
        }
      } catch (err) {
        const uiError = toAppUiError(
          err,
          {
            code: "FETCH_INFO_FAILED",
            userMessage: `URL ${i + 1} の取得に失敗しました。`,
            action: "URLや設定を確認して、もう一度お試しください。",
            retryable: true,
          },
          "FetchInfoButton.handleConfirmUrl"
        );
        errors.push(uiError.message);
      } finally {
        setFetchProgress({ current: i + 1, total: urlsToFetch.length });
      }
    }

    setFetchProgress(null);
    setIsFetching(false);
    releaseLock();

    const mergedStatus: FetchResultStatus = anySuccess
      ? "success"
      : sawDuplicatesOnly
        ? "duplicates_only"
        : sawNoDeadlines
          ? "no_deadlines"
          : "error";

    // Build merged result
    const mergedResult: FetchResult = {
      success: anySuccess,
      resultStatus: mergedStatus,
      data: anySuccess ? {
        deadlinesCount: totalDeadlinesCount,
        deadlineIds: allDeadlineIds,
        duplicatesSkipped: totalDuplicatesSkipped,
        duplicateIds: allDuplicateIds,
        applicationMethod,
        requiredDocuments,
        selectionProcess,
      } : {
        deadlinesCount: 0,
        deadlineIds: [],
        duplicatesSkipped: totalDuplicatesSkipped,
        duplicateIds: allDuplicateIds,
        applicationMethod,
        requiredDocuments,
        selectionProcess,
      },
      deadlines: mergedStatus === "success" ? allDeadlines : [],
      error: mergedStatus === "error" && errors.length > 0 ? errors.join("\n") : undefined,
      message:
        mergedStatus === "duplicates_only"
          ? "取得した締切はすべて既存データと重複していたため、新規追加はありませんでした。"
          : mergedStatus === "no_deadlines"
            ? "締切は追加されませんでした。URLを見直すか、別の候補を試してください。"
            : undefined,
      deadlinesExtractedCount: totalDeadlinesExtractedCount,
      deadlinesSavedCount: totalDeadlinesSavedCount,
      creditsConsumed: totalCreditsConsumed,
      freeUsed,
      freeRemaining,
    };

    setResult(mergedResult);
    setModalStep("result");

    if (mergedStatus === "success" && onSuccess) {
      onSuccess();
      // Show success toast with credit consumption info
      notifySuccess({
        title: "企業情報を取得しました",
        description: freeUsed ? "無料枠を使用" : `${totalCreditsConsumed}クレジット消費`,
      });
    }

  };

  const closeResult = () => {
    setModalStep("result");
    setResult(null);
    setError(null);
  };

  const toggleUrlSelection = (url: string) => {
    setSelectedUrls((prev) =>
      prev.includes(url) ? prev.filter((u) => u !== url) : [...prev, url]
    );
  };

  const handleReSearch = () => {
    if (searchQuery.trim()) {
      handleSearchPages(searchQuery);
    }
  };

  const resultTone = result?.resultStatus ?? "error";
  const modalTitle =
    modalStep === "selection"
      ? "選考条件を設定"
      : modalStep === "candidates"
        ? "採用ページURLを選択"
        : resultTone === "success"
          ? "取得完了"
          : resultTone === "duplicates_only"
            ? "新規追加なし"
            : resultTone === "no_deadlines"
              ? "締切未取得"
              : "取得失敗";

  const resolvedGraduationYear = activeGraduationYear || resolveGraduationYear();

  return (
    <>
      <button
        onClick={openModal}
        disabled={isSearching || isFetching || isLocked}
        title="1クレジット消費"
        className={cn(
          "flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border transition-colors text-sm font-medium",
          isSearching || isFetching || isLocked
            ? "text-muted-foreground cursor-wait bg-muted/30"
            : "hover:bg-muted/50"
        )}
      >
        {isSearching || isFetching ? (
          <>
            <LoadingSpinner />
            <span>{isSearching ? "検索中..." : "取得中..."}</span>
          </>
        ) : (
          <>
            <SparklesIcon />
            <span>AIで選考スケジュールを取得</span>
          </>
        )}
      </button>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-2xl max-h-[85vh] flex flex-col">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">{modalTitle}</CardTitle>
                <button
                  type="button"
                  onClick={closeModal}
                  className="p-1 rounded-full hover:bg-muted transition-colors"
                  disabled={isSearching || isFetching}
                >
                  <XIcon />
                </button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 overflow-y-auto flex-1">
              {modalStep === "selection" && (
                <div className="mx-auto w-full max-w-xl space-y-4">
                  <p className="text-sm text-muted-foreground">
                    {companyName} の選考スケジュールを検索します
                  </p>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">
                      選考タイプ
                      <span className="text-red-500 ml-1">*</span>
                    </label>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setSelectionType("main_selection")}
                        className={cn(
                          "flex-1 px-4 py-3 text-sm rounded-lg border transition-colors",
                          selectionType === "main_selection"
                            ? "bg-primary text-primary-foreground border-primary"
                            : "hover:bg-muted"
                        )}
                      >
                        本選考
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectionType("internship")}
                        className={cn(
                          "flex-1 px-4 py-3 text-sm rounded-lg border transition-colors",
                          selectionType === "internship"
                            ? "bg-primary text-primary-foreground border-primary"
                            : "hover:bg-muted"
                        )}
                      >
                        インターン
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">
                      卒業年度
                      <span className="text-red-500 ml-1">*</span>
                    </label>
                    <select
                      value={graduationYearInput}
                      onChange={(e) => setGraduationYearInput(e.target.value)}
                      className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary bg-background"
                    >
                      <option value="">卒業年度を選択</option>
                      {graduationYearOptions.map((year) => (
                        <option key={year} value={year}>
                          {year}年卒
                        </option>
                      ))}
                    </select>
                    <p className="text-xs text-muted-foreground">
                      {graduationYear
                        ? `プロフィールの ${graduationYear % 100}卒 を初期選択しています。必要ならこのモーダルで変更できます。`
                        : "この検索で使う卒業年度を選択してください。"}
                    </p>
                  </div>

                  {error && (
                    <div className="p-3 bg-red-50 rounded-lg border border-red-200">
                      <p className="text-sm text-red-800">{error}</p>
                    </div>
                  )}

                  <div className="flex justify-end gap-2 pt-2">
                    <Button variant="outline" onClick={closeModal}>
                      キャンセル
                    </Button>
                    <Button
                      onClick={() => handleSearchPages()}
                      disabled={!selectionType || !resolveGraduationYear() || isSearching}
                    >
                      {isSearching ? (
                        <>
                          <LoadingSpinner />
                          <span className="ml-2">検索中...</span>
                        </>
                      ) : (
                        "検索"
                      )}
                    </Button>
                  </div>
                </div>
              )}

              {modalStep === "candidates" && (
                <>
                  <p className="text-sm text-muted-foreground">
                    {companyName} の選考スケジュールを取得するURLを選択してください
                  </p>

                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    {selectionType && (
                      <span className="px-2 py-1 rounded-md bg-primary/10 text-primary font-medium">
                        {selectionType === "main_selection" ? "本選考" : "インターン"}
                      </span>
                    )}
                    {resolvedGraduationYear && (
                      <span className="text-muted-foreground">
                        対象年度: {resolvedGraduationYear % 100}卒
                        {activeYearSource === "profile"
                          ? "（プロフィール）"
                          : activeYearSource === "manual"
                            ? "（指定）"
                            : ""}
                      </span>
                    )}
                  </div>

                  <div className="pb-4 border-b space-y-3">
                    <div className="flex justify-between gap-2">
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          onClick={() => {
                            setError(null);
                            setModalStep("selection");
                          }}
                          disabled={isSearching || isFetching}
                        >
                          条件に戻る
                        </Button>
                        <Button variant="outline" onClick={closeModal} disabled={isSearching || isFetching}>
                          キャンセル
                        </Button>
                      </div>
                      <Button
                        onClick={handleConfirmUrl}
                        disabled={selectedUrls.length === 0 || isFetching || isSearching}
                      >
                        {isFetching ? (
                          <>
                            <LoadingSpinner />
                            <span className="ml-2">取得中...</span>
                          </>
                        ) : (
                          `選考スケジュールを取得${selectedUrls.length > 1 ? ` (${selectedUrls.length}件)` : ""}`
                        )}
                      </Button>
                    </div>

                    {(isSearching || isFetching) && (
                      <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                        {isFetching && fetchProgress ? (
                          <div className="space-y-2">
                            <div className="flex items-center justify-between text-sm text-blue-800">
                              <span>
                                {fetchProgress.current}/{fetchProgress.total} 処理中...
                              </span>
                              <span className="font-medium">
                                {Math.round((fetchProgress.current / fetchProgress.total) * 100)}%
                              </span>
                            </div>
                            <div className="w-full bg-blue-200 rounded-full h-1.5">
                              <div
                                className="bg-blue-600 h-1.5 rounded-full transition-all duration-300"
                                style={{ width: `${(fetchProgress.current / fetchProgress.total) * 100}%` }}
                              />
                            </div>
                          </div>
                        ) : isFetching ? (
                          <ProcessingSteps steps={COMPANY_FETCH_STEPS} isActive={isFetching} />
                        ) : (
                          <div className="flex items-center gap-2 text-sm text-blue-800">
                            <LoadingSpinner />
                            <span>候補URLを検索中です。</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="カスタム検索（例: 三井物産 本選考 27卒）"
                      className="flex-1 px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                      disabled={isSearching || isFetching}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && searchQuery.trim()) {
                          handleReSearch();
                        }
                      }}
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleReSearch}
                      disabled={isSearching || isFetching || !searchQuery.trim()}
                    >
                      {isSearching ? <LoadingSpinner /> : "再検索"}
                    </Button>
                  </div>

                  <div className="text-sm text-muted-foreground">
                    選択中: <span className="font-medium text-foreground">{selectedUrls.length}件</span>
                  </div>

                  {error && (
                    <div className="p-3 bg-red-50 rounded-lg border border-red-200">
                      <p className="text-sm text-red-800">{error}</p>
                    </div>
                  )}

                  <div className="space-y-3 max-h-[48vh] overflow-y-auto">
                    {hasRecruitmentUrl && (
                      <label className="flex items-start gap-3 p-3 border rounded-lg cursor-pointer hover:bg-muted/50 transition-colors">
                        <input
                          type="checkbox"
                          checked={selectedUrls.includes("existing")}
                          onChange={() => toggleUrlSelection("existing")}
                          className="mt-1"
                          disabled={isFetching}
                        />
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">登録済みURL</span>
                            <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                              推奨
                            </span>
                          </div>
                          <p className="text-sm text-muted-foreground mt-1">
                            企業情報に登録されているURLを使用
                          </p>
                        </div>
                      </label>
                    )}

                    {candidates.map((candidate, index) => {
                      const sourceType = candidate.sourceType || "other";
                      const confidence = normalizeSourceConfidence(
                        sourceType,
                        candidate.confidence
                      );
                      const label = INTEGRATED_BADGE_LABELS[sourceType]?.[confidence] || "関連・低";
                      const colors = CONFIDENCE_BADGE_COLORS[confidence] || { bg: "bg-gray-100", text: "text-gray-600" };
                      return (
                        <label
                          key={index}
                          className="flex items-start gap-3 p-3 border rounded-lg cursor-pointer hover:bg-muted/50 transition-colors"
                        >
                          <input
                            type="checkbox"
                            checked={selectedUrls.includes(candidate.url)}
                            onChange={() => toggleUrlSelection(candidate.url)}
                            className="mt-1"
                            disabled={isFetching}
                          />
                          <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium truncate">{candidate.title}</span>
                            <span
                                className={cn(
                                  "text-xs px-2 py-0.5 rounded-full flex-shrink-0",
                                  colors.bg,
                                  colors.text
                                )}
                              >
                                {label}
                              </span>
                            </div>
                            {(candidate.sourceType === "parent" || candidate.sourceType === "subsidiary") &&
                              candidate.relationCompanyName && (
                                <p className="text-xs text-muted-foreground mt-1">
                                  {candidate.sourceType === "parent" ? "親会社" : "子会社"}: {candidate.relationCompanyName}
                                  {" ・ "}自動選択はされません
                                </p>
                              )}
                            <a
                              href={candidate.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="text-xs text-muted-foreground mt-1 truncate block hover:text-primary hover:underline transition-colors"
                            >
                              {candidate.url}
                            </a>
                          </div>
                        </label>
                      );
                    })}

                    {candidates.length === 0 && !isSearching && !hasRecruitmentUrl && (
                      <div className="text-center py-6 space-y-3">
                        <p className="text-sm text-muted-foreground">
                          {isRelaxedSearch
                            ? "採用ページが見つかりませんでした。カスタム検索またはURLを直接入力してください。"
                            : "該当する採用ページが見つかりませんでした。"}
                        </p>
                        {!isRelaxedSearch && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleSearchPages(searchQuery || undefined, true)}
                            disabled={isSearching || isFetching}
                          >
                            条件を緩和して再検索
                          </Button>
                        )}
                      </div>
                    )}

                    <div className="p-3 border rounded-lg">
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={selectedUrls.includes("custom")}
                          onChange={() => toggleUrlSelection("custom")}
                          className="mt-0.5"
                          disabled={isFetching}
                        />
                        <span className="font-medium">カスタムURL</span>
                      </div>
                      <input
                        type="url"
                        value={customUrl}
                        onChange={(e) => setCustomUrl(e.target.value)}
                        placeholder="https://example.com/recruit"
                        className="w-full mt-2 px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                        disabled={!selectedUrls.includes("custom") || isFetching}
                      />
                    </div>
                  </div>
                </>
              )}

              {modalStep === "result" && result && (
                <>
                  <div className="flex items-start gap-3 rounded-xl bg-muted/50 p-4">
                    <div
                      className={cn(
                        "w-9 h-9 rounded-full flex items-center justify-center",
                        result.resultStatus === "success" && "bg-emerald-100 text-emerald-700",
                        result.resultStatus === "duplicates_only" && "bg-amber-100 text-amber-700",
                        result.resultStatus === "no_deadlines" && "bg-yellow-100 text-yellow-700",
                        result.resultStatus === "error" && "bg-red-100 text-red-700"
                      )}
                    >
                      {result.resultStatus === "success" ? <CheckIcon /> : <XIcon />}
                    </div>
                    <div className="space-y-1 flex-1">
                      <p className="font-medium">{companyName}</p>
                      <p className="text-sm text-muted-foreground">
                        {result.resultStatus === "success"
                          ? "新しい締切を保存しました。"
                          : result.resultStatus === "duplicates_only"
                            ? "既存締切と重複していたため、新規保存はありません。"
                            : result.resultStatus === "no_deadlines"
                              ? "締切は追加されませんでした。候補URLか年度条件を見直してください。"
                              : "取得に失敗しました。別のURLを試してください。"}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">新規追加した締切</span>
                      <span className="font-medium text-primary">
                        {result.deadlinesSavedCount ?? result.data?.deadlinesCount ?? 0}件
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">抽出した締切候補</span>
                      <span className="font-medium">
                        {result.deadlinesExtractedCount ?? result.data?.deadlinesCount ?? 0}件
                      </span>
                    </div>
                    {(result.data?.duplicatesSkipped ?? 0) > 0 && (
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-muted-foreground">重複で追加しなかった件数</span>
                        <span className="font-medium text-muted-foreground">
                          {result.data?.duplicatesSkipped}件
                        </span>
                      </div>
                    )}
                  </div>

                  {result.deadlines && result.deadlines.length > 0 && (
                    <div className="pt-2 border-t border-border">
                      <span className="text-sm text-muted-foreground block mb-2">締切一覧</span>
                      <div className="space-y-2 max-h-40 overflow-y-auto">
                        {result.deadlines.map((deadline, i) => (
                          <div
                            key={deadline.id || i}
                            className="flex items-center justify-between text-sm p-2 bg-background rounded-lg border"
                          >
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-medium truncate">{deadline.title}</span>
                                {deadline.isDuplicate && (
                                  <span className="text-xs px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">
                                    重複
                                  </span>
                                )}
                              </div>
                            </div>
                            <span className="text-muted-foreground flex-shrink-0 ml-2">
                              {deadline.dueDate
                                ? new Date(deadline.dueDate).toLocaleDateString("ja-JP", {
                                    month: "short",
                                    day: "numeric",
                                  })
                                : "日付未定"}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {result.data?.applicationMethod && (
                    <div className="pt-2 border-t border-border">
                      <span className="text-sm text-muted-foreground block mb-1">応募方法</span>
                      <p className="text-sm">{result.data.applicationMethod}</p>
                    </div>
                  )}

                  {result.data?.requiredDocuments && result.data.requiredDocuments.length > 0 && (
                    <div className="pt-2 border-t border-border">
                      <span className="text-sm text-muted-foreground block mb-1">必要書類</span>
                      <div className="flex flex-wrap gap-1">
                        {result.data.requiredDocuments.map((doc, i) => (
                          <span
                            key={i}
                            className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary"
                          >
                            {doc}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {result.data?.selectionProcess && (
                    <div className="pt-2 border-t border-border">
                      <span className="text-sm text-muted-foreground block mb-1">選考フロー</span>
                      <p className="text-sm">{result.data.selectionProcess}</p>
                    </div>
                  )}

                  {(result.message || result.error) && (
                    <div
                      className={cn(
                        "p-3 rounded-lg border",
                        result.resultStatus === "error"
                          ? "bg-red-50 border-red-200"
                          : "bg-blue-50 border-blue-200"
                      )}
                    >
                      <p
                        className={cn(
                          "text-sm",
                          result.resultStatus === "error" ? "text-red-800" : "text-blue-800"
                        )}
                      >
                        {result.error || result.message}
                      </p>
                    </div>
                  )}

                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">
                      {result.freeUsed ? "無料回数を使用" : "クレジット消費"}
                    </span>
                    <span className="font-medium">
                      {result.freeUsed
                        ? `残り${result.freeRemaining ?? 0}回/日`
                        : `${result.creditsConsumed ?? 0}クレジット`}
                    </span>
                  </div>

                  {(result.data?.deadlinesCount ?? 0) > 0 && result.resultStatus === "success" && (
                    <div className="p-3 bg-yellow-50 rounded-lg border border-yellow-200">
                      <p className="text-sm text-yellow-800">
                        抽出された締切は「要確認」状態で保存されました。内容を確認して承認してください。
                      </p>
                    </div>
                  )}

                  <div className="flex justify-end gap-2 pt-2">
                    {result.resultStatus !== "success" && (
                      <Button
                        variant="outline"
                        onClick={() => {
                          closeResult();
                          setModalStep("candidates");
                        }}
                      >
                        候補に戻る
                      </Button>
                    )}
                    <Button onClick={closeModal}>閉じる</Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );
}
