"use client";

import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { ProcessingSteps, COMPANY_FETCH_STEPS } from "@/components/ui/ProcessingSteps";
import { useOperationLock } from "@/hooks/useOperationLock";
import { notifyMessage, notifySuccess } from "@/lib/notifications";
import { parseApiErrorResponse, toAppUiError } from "@/lib/api-errors";
import { notifyUserFacingAppError } from "@/lib/client-error-ui";
import {
  CONFIDENCE_BADGE_COLORS,
  INTEGRATED_BADGE_LABELS,
  normalizeSourceConfidence,
} from "@/lib/company-info/source-badges";
import { shouldCloseScheduleFetchModalOnResult } from "@/lib/company-info/fetch-ui";

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
  complianceStatus?: "allowed" | "warning" | "blocked";
  complianceReasons?: string[];
}

interface SearchPagesResponse {
  candidates: SearchCandidate[];
  usedGraduationYear: number | null;
  yearSource: "profile" | "manual" | "none";
}

interface ComplianceCheckResponse {
  blockedResults: Array<{ url: string; reasons: string[] }>;
  warningResults: Array<{ url: string; reasons: string[] }>;
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
  return {
    "Content-Type": "application/json",
  };
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
  /** true while POST /fetch-info is in flight (show step progress); false during pre-check */
  const [isExtractingDeadlines, setIsExtractingDeadlines] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [candidates, setCandidates] = useState<SearchCandidate[]>([]);
  const [selectedSource, setSelectedSource] = useState<string | null>(null);
  const [customUrl, setCustomUrl] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [result, setResult] = useState<FetchResult | null>(null);
  const [error, setError] = useState<string | null>(null);
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
    setSelectedSource(null);
    setCustomUrl("");
    setSearchQuery("");
    setResult(null);
    setError(null);
    setSelectionType(null);
    setGraduationYearInput(graduationYear ? String(graduationYear) : "");
    setActiveGraduationYear(graduationYear);
    setActiveYearSource(graduationYear ? "profile" : "none");
    setIsRelaxedSearch(false);
    setIsFetching(false);
    setIsSearching(false);
    setIsExtractingDeadlines(false);
  };

  const openModal = () => {
    resetTransientState();
    setShowModal(true);
  };

  const closeModal = (force = false) => {
    if (!force && (isSearching || isFetching)) return;
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
      const defaultSelection =
        hasRecruitmentUrl
          ? "existing"
          : data.candidates.find((candidate) => candidate.complianceStatus !== "blocked")?.url ?? null;
      setSelectedSource(defaultSelection);
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
      notifyUserFacingAppError(uiError);
      setCandidates([]);
      setSelectedSource(null);
    } finally {
      setIsSearching(false);
      releaseLock();
    }
  };

  const handleConfirmUrl = async () => {
    if (!acquireLock("採用情報を取得中")) return;
    let urlToFetch = "";

    if (selectedSource === "existing" && hasRecruitmentUrl) {
      urlToFetch = "";
    } else if (selectedSource === "custom") {
      if (!customUrl.trim()) {
        setError("カスタムURLを入力してください");
        releaseLock();
        return;
      }
      urlToFetch = customUrl.trim();
    } else if (selectedSource) {
      urlToFetch = selectedSource;
    }

    if (!selectedSource) {
      setError("URLを選択してください");
      releaseLock();
      return;
    }

    setError(null);
    setIsFetching(true);
    setIsExtractingDeadlines(false);

    if (urlToFetch) {
      try {
        const complianceResponse = await fetch(`/api/companies/${companyId}/source-compliance/check`, {
          method: "POST",
          headers: buildHeaders(),
          credentials: "include",
          body: JSON.stringify({ urls: [urlToFetch] }),
        });
        if (complianceResponse.ok) {
          const complianceData: ComplianceCheckResponse = await complianceResponse.json();
          if (complianceData.blockedResults.length > 0) {
            setError(complianceData.blockedResults[0]?.reasons[0] || "公開ページURLのみ取得できます");
            setIsFetching(false);
            releaseLock();
            return;
          }
          if (complianceData.warningResults.length > 0) {
            notifyMessage(
              complianceData.warningResults[0]?.reasons[0] ||
                "要確認: 利用規約を確認してください。",
            );
          }
        }
      } catch {
        // Fall through to route-level validation.
      }
    }

    setIsExtractingDeadlines(true);
    try {
      const response = await fetch(`/api/companies/${companyId}/fetch-info`, {
        method: "POST",
        headers: buildHeaders(),
        credentials: "include",
        body: JSON.stringify({
          url: urlToFetch,
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
        setError(uiError.message);
        notifyUserFacingAppError(uiError);
        return;
      }

      if (!response.ok) {
        const uiError = await parseApiErrorResponse(
          response,
          {
            code: "FETCH_INFO_FAILED",
            userMessage: "情報の取得に失敗しました。",
            action: "URLや設定を確認して、もう一度お試しください。",
            retryable: true,
          },
          "FetchInfoButton.handleConfirmUrl"
        );
        setError(uiError.message);
        notifyUserFacingAppError(uiError);
        return;
      }

      const data: FetchResult = await response.json();
      if (shouldCloseScheduleFetchModalOnResult(data.resultStatus)) {
        closeModal(true);
        if (data.resultStatus === "success") {
          onSuccess?.();
          window.setTimeout(() => {
            notifySuccess({
              title: "選考スケジュールを取得しました",
              description: data.freeUsed
                ? "今回は無料枠を使用しました。"
                : `${data.creditsConsumed}クレジットを消費しました。`,
              duration: 4800,
            });
          }, 220);
          return;
        }

        window.setTimeout(() => {
          notifyMessage(
            data.resultStatus === "duplicates_only"
              ? "既存の締切と重複していたため、新しい締切は追加されませんでした。"
              : "締切は見つかりませんでした。候補URLか年度条件を見直してください。",
            4800
          );
        }, 220);
        return;
      }

      setResult(data);
      setModalStep("result");
    } catch (err) {
      const uiError = toAppUiError(
        err,
        {
          code: "FETCH_INFO_FAILED",
          userMessage: "情報の取得に失敗しました。",
          action: "URLや設定を確認して、もう一度お試しください。",
          retryable: true,
        },
        "FetchInfoButton.handleConfirmUrl"
      );
      setError(uiError.message);
      notifyUserFacingAppError(uiError);
    } finally {
      setIsFetching(false);
      setIsExtractingDeadlines(false);
      releaseLock();
    }
  };

  const closeResult = () => {
    setResult(null);
    setError(null);
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
            <Loader2 className="size-5 shrink-0 animate-spin" aria-hidden />
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
                  onClick={() => closeModal()}
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
                    <Button variant="outline" onClick={() => closeModal()}>
                      キャンセル
                    </Button>
                    <Button
                      onClick={() => handleSearchPages()}
                      disabled={!selectionType || !resolveGraduationYear() || isSearching}
                      className={cn(isSearching && "cursor-wait disabled:opacity-100")}
                    >
                      {isSearching ? (
                        <>
                          <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden />
                          <span>検索中...</span>
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
                        <Button variant="outline" onClick={() => closeModal()} disabled={isSearching || isFetching}>
                          キャンセル
                        </Button>
                      </div>
                      <Button
                        onClick={handleConfirmUrl}
                        disabled={!selectedSource || isFetching || isSearching}
                        aria-busy={isFetching}
                        className={cn(isFetching && "cursor-wait disabled:opacity-100")}
                      >
                        {isFetching ? (
                          <>
                            <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden />
                            <span>取得中...</span>
                          </>
                        ) : (
                          "選考スケジュールを取得"
                        )}
                      </Button>
                    </div>

                    {(isSearching || isFetching) && (
                      <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                        {isSearching ? (
                          <div className="flex items-center gap-2 text-sm text-blue-800">
                            <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden />
                            <span>候補URLを検索中です。</span>
                          </div>
                        ) : isExtractingDeadlines ? (
                          <ProcessingSteps steps={COMPANY_FETCH_STEPS} isActive={isExtractingDeadlines} />
                        ) : (
                          <div className="flex items-center gap-2 text-sm text-blue-800">
                            <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden />
                            <span>取得の準備をしています…</span>
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
                      className={cn(isSearching && "cursor-wait disabled:opacity-100")}
                    >
                      {isSearching ? (
                        <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden />
                      ) : (
                        "再検索"
                      )}
                    </Button>
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
                          type="radio"
                          name="schedule-source"
                          checked={selectedSource === "existing"}
                          onChange={() => setSelectedSource("existing")}
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
                            type="radio"
                            name="schedule-source"
                            checked={selectedSource === candidate.url}
                            onChange={() => setSelectedSource(candidate.url)}
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
                            {candidate.complianceStatus === "blocked" && candidate.complianceReasons?.[0] && (
                              <p className="text-xs text-destructive mt-1">{candidate.complianceReasons[0]}</p>
                            )}
                            {candidate.complianceStatus === "warning" && candidate.complianceReasons?.[0] && (
                              <p className="text-xs text-amber-700 mt-1">
                                {candidate.complianceReasons[0]}
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
                          type="radio"
                          name="schedule-source"
                          checked={selectedSource === "custom"}
                          onChange={() => setSelectedSource("custom")}
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
                        disabled={selectedSource !== "custom" || isFetching}
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
                        ? `残り${result.freeRemaining ?? 0}回/月`
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
                    <Button onClick={() => closeModal()}>閉じる</Button>
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
