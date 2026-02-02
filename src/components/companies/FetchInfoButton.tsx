"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { getDeviceToken } from "@/lib/auth/device-token";
import { ProcessingSteps, COMPANY_FETCH_STEPS } from "@/components/ui/ProcessingSteps";

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
  sourceType: "official" | "job_site" | "subsidiary" | "parent" | "other";
}

// Integrated badge labels (combining source type + confidence)
const INTEGRATED_BADGE_LABELS: Record<string, Record<string, string>> = {
  official: { high: "公式・高", medium: "公式・中", low: "公式・低" },
  subsidiary: { high: "子会社・高", medium: "子会社・中", low: "子会社・低" },
  parent: { high: "親会社・高", medium: "親会社・中", low: "親会社・低" },
  job_site: { high: "就活・高", medium: "就活・中", low: "就活・低" },
  other: { high: "関連・高", medium: "関連・中", low: "関連・低" },
};

// Integrated badge colors
const INTEGRATED_BADGE_COLORS: Record<string, Record<string, { bg: string; text: string }>> = {
  official: {
    high: { bg: "bg-emerald-100", text: "text-emerald-700" },
    medium: { bg: "bg-emerald-100", text: "text-emerald-700" },
    low: { bg: "bg-emerald-50", text: "text-emerald-600" },
  },
  subsidiary: {
    high: { bg: "bg-orange-100", text: "text-orange-700" },
    medium: { bg: "bg-orange-100", text: "text-orange-700" },
    low: { bg: "bg-orange-50", text: "text-orange-600" },
  },
  parent: {
    high: { bg: "bg-purple-100", text: "text-purple-700" },
    medium: { bg: "bg-purple-100", text: "text-purple-700" },
    low: { bg: "bg-purple-50", text: "text-purple-600" },
  },
  job_site: {
    high: { bg: "bg-blue-100", text: "text-blue-700" },
    medium: { bg: "bg-blue-100", text: "text-blue-700" },
    low: { bg: "bg-blue-50", text: "text-blue-600" },
  },
  other: {
    high: { bg: "bg-yellow-100", text: "text-yellow-700" },
    medium: { bg: "bg-gray-100", text: "text-gray-600" },
    low: { bg: "bg-gray-100", text: "text-gray-500" },
  },
};

interface DeadlineSummary {
  id: string;
  title: string;
  type: string;
  dueDate: string;
  sourceUrl?: string | null;
}

interface FetchResult {
  success: boolean;
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

function buildEventTimes(dueDate: string) {
  const start = new Date(dueDate);
  if (Number.isNaN(start.getTime())) {
    return null;
  }
  if (start.getUTCHours() === 0 && start.getUTCMinutes() === 0 && start.getUTCSeconds() === 0) {
    start.setUTCHours(3, 0, 0, 0); // 12:00 JST
  }
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  return { startAt: start.toISOString(), endAt: end.toISOString() };
}

export function FetchInfoButton({
  companyId,
  companyName,
  hasRecruitmentUrl,
  onSuccess,
}: FetchInfoButtonProps) {
  const [isFetching, setIsFetching] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [showUrlSelector, setShowUrlSelector] = useState(false);
  const [showResult, setShowResult] = useState(false);
  const [candidates, setCandidates] = useState<SearchCandidate[]>([]);
  const [selectedUrls, setSelectedUrls] = useState<string[]>([]);
  const [customUrl, setCustomUrl] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [result, setResult] = useState<FetchResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [calendarNotice, setCalendarNotice] = useState<string | null>(null);
  // Progress tracking for sequential URL processing
  const [fetchProgress, setFetchProgress] = useState<{ current: number; total: number } | null>(null);
  // Selection type filter (main_selection / internship) - required for accurate search
  const [selectionType, setSelectionType] = useState<SelectionTypeState>(null);
  // Selection type modal visibility
  const [showSelectionTypeModal, setShowSelectionTypeModal] = useState(false);
  // User's graduation year from profile
  const [graduationYear, setGraduationYear] = useState<number | null>(null);
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

  const handleSearchPages = async (customQueryOverride?: string, allowSnippetMatch = false) => {
    setIsSearching(true);
    setError(null);
    setIsRelaxedSearch(allowSnippetMatch);

    const queryToUse = customQueryOverride ?? searchQuery;

    try {
      const response = await fetch(`/api/companies/${companyId}/search-pages`, {
        method: "POST",
        headers: buildHeaders(),
        credentials: "include",
        body: JSON.stringify({
          customQuery: queryToUse || undefined,
          selectionType: selectionType || undefined,
          allowSnippetMatch,
          graduationYear: graduationYear || undefined,
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "URL候補の検索に失敗しました");
      }

      const data: { candidates: SearchCandidate[] } = await response.json();
      setCandidates(data.candidates);

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

      setShowUrlSelector(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "URL候補の検索に失敗しました");
      setShowResult(true);
    } finally {
      setIsSearching(false);
    }
  };

  const addDeadlinesToGoogleCalendar = async (deadlines: DeadlineSummary[]) => {
    if (!deadlines.length) return;

    try {
      const settingsResponse = await fetch("/api/calendar/settings", {
        credentials: "include",
      });

      if (!settingsResponse.ok) {
        return;
      }

      const settingsData = await settingsResponse.json();
      if (!settingsData?.settings?.isGoogleConnected) {
        setCalendarNotice("Googleカレンダー未連携のため追加されませんでした");
        return;
      }

      const results = await Promise.allSettled(
        deadlines.map(async (deadline) => {
          const eventTimes = buildEventTimes(deadline.dueDate);
          if (!eventTimes) {
            throw new Error("Invalid due date");
          }

          const title = `${companyName} ${deadline.title}`.trim();
          const description = deadline.sourceUrl ? `取得元: ${deadline.sourceUrl}` : undefined;

          const response = await fetch("/api/calendar/google", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({
              action: "create",
              title,
              startAt: eventTimes.startAt,
              endAt: eventTimes.endAt,
              description,
            }),
          });

          if (!response.ok) {
            throw new Error("Failed to create Google Calendar event");
          }
        })
      );

      const successCount = results.filter((item) => item.status === "fulfilled").length;
      const failureCount = results.length - successCount;

      if (successCount > 0) {
        setCalendarNotice(
          `Googleカレンダーに${successCount}件追加しました${failureCount ? `（${failureCount}件失敗）` : ""}`
        );
      } else if (failureCount > 0) {
        setCalendarNotice("Googleカレンダーへの追加に失敗しました");
      }
    } catch {
      setCalendarNotice("Googleカレンダーへの追加に失敗しました");
    }
  };

  const handleFetchFromUrl = async (url: string) => {
    setIsFetching(true);
    setError(null);
    setCalendarNotice(null);

    try {
      const response = await fetch(`/api/companies/${companyId}/fetch-info`, {
        method: "POST",
        headers: buildHeaders(),
        credentials: "include",
        body: JSON.stringify({
          url,
          selectionType: selectionType || undefined,
          graduationYear: graduationYear || undefined,
        }),
      });

      if (response.status === 402) {
        const data = await response.json();
        setError(data.error || "クレジットが不足しています");
        setShowResult(true);
        return;
      }

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "情報の取得に失敗しました");
      }

      const data: FetchResult = await response.json();
      setResult(data);
      setShowUrlSelector(false);
      setShowResult(true);

      if (data.success && onSuccess) {
        onSuccess();
      }

      if (data.deadlines && data.deadlines.length > 0) {
        await addDeadlinesToGoogleCalendar(data.deadlines);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "情報の取得に失敗しました");
      setShowResult(true);
    } finally {
      setIsFetching(false);
    }
  };

  const handleConfirmUrl = async () => {
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
        return;
      }
      urlsToFetch.push(customUrl.trim());
    }

    if (urlsToFetch.length === 0) {
      setError("URLを選択してください");
      return;
    }

    // Sequential processing with progress tracking
    setIsFetching(true);
    setError(null);
    setCalendarNotice(null);
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
    const errors: string[] = [];
    let anySuccess = false;

    for (let i = 0; i < urlsToFetch.length; i++) {
      const url = urlsToFetch[i];
      setFetchProgress({ current: i + 1, total: urlsToFetch.length });

      try {
        const response = await fetch(`/api/companies/${companyId}/fetch-info`, {
          method: "POST",
          headers: buildHeaders(),
          credentials: "include",
          body: JSON.stringify({
            url,
            selectionType: selectionType || undefined,
            graduationYear: graduationYear || undefined,
          }),
        });

        if (response.status === 402) {
          const data = await response.json();
          errors.push(data.error || "クレジットが不足しています");
          continue;
        }

        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          errors.push(data.error || `URL ${i + 1} の取得に失敗しました`);
          continue;
        }

        const data: FetchResult = await response.json();

        if (data.success && data.data) {
          anySuccess = true;
          totalDeadlinesCount += data.data.deadlinesCount || 0;
          totalDuplicatesSkipped += data.data.duplicatesSkipped || 0;
          allDeadlineIds.push(...(data.data.deadlineIds || []));
          allDuplicateIds.push(...(data.data.duplicateIds || []));
          if (data.deadlines) {
            allDeadlines.push(...data.deadlines);
          }
          // Merge application method (take first non-null)
          if (!applicationMethod && data.data.applicationMethod) {
            applicationMethod = data.data.applicationMethod;
          }
          // Merge required documents (unique values)
          if (data.data.requiredDocuments) {
            for (const doc of data.data.requiredDocuments) {
              if (!requiredDocuments.includes(doc)) {
                requiredDocuments.push(doc);
              }
            }
          }
          // Merge selection process (take first non-null)
          if (!selectionProcess && data.data.selectionProcess) {
            selectionProcess = data.data.selectionProcess;
          }
        }

        totalCreditsConsumed += data.creditsConsumed || 0;
        freeUsed = freeUsed || data.freeUsed;
        freeRemaining = data.freeRemaining;
      } catch (err) {
        errors.push(err instanceof Error ? err.message : `URL ${i + 1} の取得に失敗しました`);
      }
    }

    setFetchProgress(null);
    setIsFetching(false);

    // Build merged result
    const mergedResult: FetchResult = {
      success: anySuccess,
      data: anySuccess ? {
        deadlinesCount: totalDeadlinesCount,
        deadlineIds: allDeadlineIds,
        duplicatesSkipped: totalDuplicatesSkipped,
        duplicateIds: allDuplicateIds,
        applicationMethod,
        requiredDocuments,
        selectionProcess,
      } : undefined,
      deadlines: allDeadlines,
      error: errors.length > 0 ? errors.join("\n") : undefined,
      creditsConsumed: totalCreditsConsumed,
      freeUsed,
      freeRemaining,
    };

    setResult(mergedResult);
    setShowUrlSelector(false);
    setShowResult(true);

    if (anySuccess && onSuccess) {
      onSuccess();
    }

    if (allDeadlines.length > 0) {
      await addDeadlinesToGoogleCalendar(allDeadlines);
    }
  };

  const closeResult = () => {
    setShowResult(false);
    setResult(null);
    setError(null);
    setCalendarNotice(null);
  };

  const closeUrlSelector = () => {
    setShowUrlSelector(false);
    setCandidates([]);
    setSelectedUrls([]);
    setCustomUrl("");
    setSearchQuery("");
    setError(null);
    setFetchProgress(null);
    // Keep selectionType for next search - reset only when selection type modal is cancelled
    setIsRelaxedSearch(false);
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

  return (
    <>
      <Button
        variant="outline"
        onClick={() => setShowSelectionTypeModal(true)}
        disabled={isSearching || isFetching}
        className="gap-2"
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
      </Button>

      {/* Selection Type Modal - Step 1: Choose selection type before search */}
      {showSelectionTypeModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="max-w-md w-full">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">選考タイプを選択</CardTitle>
                <button
                  type="button"
                  onClick={() => {
                    setShowSelectionTypeModal(false);
                    setSelectionType(null);
                  }}
                  className="p-1 rounded-full hover:bg-muted transition-colors"
                >
                  <XIcon />
                </button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
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
                {!selectionType && (
                  <p className="text-xs text-red-500">
                    選考タイプを選択してください
                  </p>
                )}
                {graduationYear && selectionType && (
                  <p className="text-xs text-muted-foreground">
                    {graduationYear % 100}卒向けの{selectionType === "main_selection" ? "本選考" : "インターン"}スケジュールを検索します
                  </p>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowSelectionTypeModal(false);
                    setSelectionType(null);
                  }}
                >
                  キャンセル
                </Button>
                <Button
                  onClick={() => {
                    setShowSelectionTypeModal(false);
                    handleSearchPages();
                  }}
                  disabled={!selectionType || isSearching}
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
            </CardContent>
          </Card>
        </div>
      )}

      {/* URL Selector modal */}
      {showUrlSelector && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="max-w-2xl w-full max-h-[80vh] overflow-y-auto">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">採用ページURLを選択</CardTitle>
                <button
                  type="button"
                  onClick={closeUrlSelector}
                  className="p-1 rounded-full hover:bg-muted transition-colors"
                  disabled={isFetching}
                >
                  <XIcon />
                </button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                {companyName} の選考スケジュールを取得するURLを選択してください
              </p>

              {/* Action buttons and progress at top for easy access */}
              <div className="pb-4 border-b space-y-3">
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={closeUrlSelector} disabled={isFetching}>
                    キャンセル
                  </Button>
                  <Button
                    onClick={handleConfirmUrl}
                    disabled={selectedUrls.length === 0 || isFetching}
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
                {/* Progress indicator - Labor Illusion: Show processing steps */}
                {isFetching && (
                  <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                    {fetchProgress ? (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-sm text-blue-800">
                          <span>処理中: {fetchProgress.current} / {fetchProgress.total}</span>
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
                    ) : (
                      <ProcessingSteps steps={COMPANY_FETCH_STEPS} isActive={isFetching} />
                    )}
                  </div>
                )}
              </div>

              {/* Display selected type */}
              {selectionType && (
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground">選考タイプ:</span>
                  <span className="px-2 py-1 rounded-md bg-primary/10 text-primary font-medium">
                    {selectionType === "main_selection" ? "本選考" : "インターン"}
                  </span>
                  {graduationYear && (
                    <span className="text-muted-foreground">
                      ({graduationYear % 100}卒向け)
                    </span>
                  )}
                </div>
              )}

              {/* Custom search input */}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="カスタム検索（例: 三井物産 採用、トヨタ インターン 2026）"
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
                  {isSearching ? <LoadingSpinner /> : "検索"}
                </Button>
              </div>

              {/* Selection count */}
              <div className="text-sm text-muted-foreground">
                選択中: <span className="font-medium text-foreground">{selectedUrls.length}件</span>
              </div>

              {error && (
                <div className="p-3 bg-red-50 rounded-lg border border-red-200">
                  <p className="text-sm text-red-800">{error}</p>
                </div>
              )}

              <div className="space-y-3 max-h-[50vh] overflow-y-auto">
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

                {candidates.map((candidate, index) => (
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
                        {/* Integrated badge (source type + confidence) */}
                        {(() => {
                          const sourceType = candidate.sourceType || "other";
                          const confidence = candidate.confidence || "low";
                          const label = INTEGRATED_BADGE_LABELS[sourceType]?.[confidence] || "関連・低";
                          const colors = INTEGRATED_BADGE_COLORS[sourceType]?.[confidence] || { bg: "bg-gray-100", text: "text-gray-500" };
                          return (
                            <span
                              className={cn(
                                "text-xs px-2 py-0.5 rounded-full flex-shrink-0",
                                colors.bg,
                                colors.text
                              )}
                            >
                              {label}
                            </span>
                          );
                        })()}
                      </div>
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
                ))}

                {/* Empty state with relaxed search option */}
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

                {/* Custom URL section */}
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

            </CardContent>
          </Card>
        </div>
      )}

      {/* Result modal */}
      {showResult && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="max-w-md w-full max-h-[80vh] flex flex-col">
            <CardHeader className="pb-3 flex-shrink-0">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg flex items-center gap-2">
                  {error ? (
                    <>
                      <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center">
                        <XIcon />
                      </div>
                      <span className="text-red-700">取得失敗</span>
                    </>
                  ) : result?.success ? (
                    <>
                      <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600">
                        <CheckIcon />
                      </div>
                      <span className="text-emerald-700">取得完了</span>
                    </>
                  ) : (
                    <>
                      <div className="w-8 h-8 rounded-full bg-yellow-100 flex items-center justify-center text-yellow-600">
                        <XIcon />
                      </div>
                      <span className="text-yellow-700">情報なし</span>
                    </>
                  )}
                </CardTitle>
                <button
                  type="button"
                  onClick={closeResult}
                  className="p-1 rounded-full hover:bg-muted transition-colors"
                >
                  <XIcon />
                </button>
              </div>
              {/* Button at top for easy access */}
              <div className="flex justify-end pt-3 mt-3 border-t">
                <Button onClick={closeResult}>閉じる</Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 overflow-y-auto flex-1">
              {error ? (
                <p className="text-sm text-muted-foreground">{error}</p>
              ) : result?.success ? (
                <>
                  <div className="bg-muted/50 rounded-xl p-4 space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">企業名</span>
                      <span className="font-medium">{companyName}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">抽出された締切</span>
                      <span className="font-medium text-primary">
                        {result.data?.deadlinesCount || 0}件
                      </span>
                    </div>
                    {(result.data?.duplicatesSkipped ?? 0) > 0 && (
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-muted-foreground">スキップ（重複）</span>
                        <span className="font-medium text-muted-foreground">
                          {result.data?.duplicatesSkipped}件
                        </span>
                      </div>
                    )}
                    {/* Deadline list */}
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
                                  <span
                                    className={cn(
                                      "text-xs px-1.5 py-0.5 rounded-full flex-shrink-0",
                                      deadline.type === "es" && "bg-blue-100 text-blue-700",
                                      deadline.type === "interview" && "bg-purple-100 text-purple-700",
                                      deadline.type === "webtest" && "bg-orange-100 text-orange-700",
                                      deadline.type === "other" && "bg-gray-100 text-gray-700"
                                    )}
                                  >
                                    {deadline.type === "es"
                                      ? "ES"
                                      : deadline.type === "interview"
                                        ? "面接"
                                        : deadline.type === "webtest"
                                          ? "Webテスト"
                                          : "その他"}
                                  </span>
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
                  </div>

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

                  {result.message && (
                    <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                      <p className="text-sm text-blue-800">{result.message}</p>
                    </div>
                  )}

                  {calendarNotice && (
                    <div className="p-3 bg-emerald-50 rounded-lg border border-emerald-200">
                      <p className="text-sm text-emerald-800">{calendarNotice}</p>
                    </div>
                  )}

                  {(result.data?.deadlinesCount ?? 0) > 0 && (
                    <div className="p-3 bg-yellow-50 rounded-lg border border-yellow-200">
                      <p className="text-sm text-yellow-800">
                        抽出された締切は「要確認」状態で保存されました。内容を確認して承認してください。
                      </p>
                    </div>
                  )}
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {result?.error || "採用ページから情報を抽出できませんでした。手動で締切を追加してください。"}
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );
}
