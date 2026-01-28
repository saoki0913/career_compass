"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { getDeviceToken } from "@/lib/auth/device-token";

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
}

interface FetchResult {
  success: boolean;
  data?: {
    deadlinesCount: number;
    deadlineIds: string[];
    applicationMethod: string | null;
    requiredDocuments: string[];
    selectionProcess: string | null;
  };
  error?: string;
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
  const [isFetching, setIsFetching] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [showUrlSelector, setShowUrlSelector] = useState(false);
  const [showResult, setShowResult] = useState(false);
  const [candidates, setCandidates] = useState<SearchCandidate[]>([]);
  const [selectedUrl, setSelectedUrl] = useState<string>("");
  const [customUrl, setCustomUrl] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [result, setResult] = useState<FetchResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSearchPages = async (customQueryOverride?: string) => {
    setIsSearching(true);
    setError(null);

    const queryToUse = customQueryOverride ?? searchQuery;

    try {
      const response = await fetch(`/api/companies/${companyId}/search-pages`, {
        method: "POST",
        headers: buildHeaders(),
        credentials: "include",
        body: JSON.stringify({
          customQuery: queryToUse || undefined,
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "URL候補の検索に失敗しました");
      }

      const data: { candidates: SearchCandidate[] } = await response.json();
      setCandidates(data.candidates);

      // If company already has a recruitment URL, pre-select it
      if (hasRecruitmentUrl) {
        setSelectedUrl("existing");
      } else if (data.candidates.length > 0) {
        // Otherwise, select the first (highest confidence) candidate
        setSelectedUrl(data.candidates[0].url);
      }

      setShowUrlSelector(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "URL候補の検索に失敗しました");
      setShowResult(true);
    } finally {
      setIsSearching(false);
    }
  };

  const handleFetchFromUrl = async (url: string) => {
    setIsFetching(true);
    setError(null);

    try {
      const response = await fetch(`/api/companies/${companyId}/fetch-info`, {
        method: "POST",
        headers: buildHeaders(),
        credentials: "include",
        body: JSON.stringify({ url }),
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
    } catch (err) {
      setError(err instanceof Error ? err.message : "情報の取得に失敗しました");
      setShowResult(true);
    } finally {
      setIsFetching(false);
    }
  };

  const handleConfirmUrl = () => {
    let urlToFetch = "";

    if (selectedUrl === "existing" && hasRecruitmentUrl) {
      // Use the existing recruitment URL (will be fetched by API)
      urlToFetch = "";
    } else if (selectedUrl === "custom") {
      urlToFetch = customUrl;
    } else {
      urlToFetch = selectedUrl;
    }

    if (selectedUrl === "custom" && !customUrl.trim()) {
      setError("カスタムURLを入力してください");
      return;
    }

    handleFetchFromUrl(urlToFetch);
  };

  const closeResult = () => {
    setShowResult(false);
    setResult(null);
    setError(null);
  };

  const closeUrlSelector = () => {
    setShowUrlSelector(false);
    setCandidates([]);
    setSelectedUrl("");
    setCustomUrl("");
    setSearchQuery("");
    setError(null);
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
        onClick={() => handleSearchPages()}
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
            <span>AIで情報取得</span>
          </>
        )}
      </Button>

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
                {companyName} の採用情報を取得するURLを選択してください
              </p>

              {/* Custom search input */}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="カスタム検索（例: 三井物産 IR、トヨタ インターン 2026）"
                  className="flex-1 px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  disabled={isSearching}
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
                  disabled={isSearching || !searchQuery.trim()}
                >
                  {isSearching ? <LoadingSpinner /> : "検索"}
                </Button>
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
                      type="radio"
                      name="url"
                      value="existing"
                      checked={selectedUrl === "existing"}
                      onChange={(e) => setSelectedUrl(e.target.value)}
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
                      type="radio"
                      name="url"
                      value={candidate.url}
                      checked={selectedUrl === candidate.url}
                      onChange={(e) => setSelectedUrl(e.target.value)}
                      className="mt-1"
                      disabled={isFetching}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium truncate">{candidate.title}</span>
                        <span
                          className={cn(
                            "text-xs px-2 py-0.5 rounded-full",
                            candidate.confidence === "high" && "bg-emerald-100 text-emerald-700",
                            candidate.confidence === "medium" && "bg-yellow-100 text-yellow-700",
                            candidate.confidence === "low" && "bg-gray-100 text-gray-700"
                          )}
                        >
                          {candidate.confidence === "high" && "高"}
                          {candidate.confidence === "medium" && "中"}
                          {candidate.confidence === "low" && "低"}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1 truncate">
                        {candidate.url}
                      </p>
                    </div>
                  </label>
                ))}

                <label className="flex items-start gap-3 p-3 border rounded-lg cursor-pointer hover:bg-muted/50 transition-colors">
                  <input
                    type="radio"
                    name="url"
                    value="custom"
                    checked={selectedUrl === "custom"}
                    onChange={(e) => setSelectedUrl(e.target.value)}
                    className="mt-1"
                    disabled={isFetching}
                  />
                  <div className="flex-1">
                    <span className="font-medium">カスタムURL</span>
                    <input
                      type="url"
                      value={customUrl}
                      onChange={(e) => setCustomUrl(e.target.value)}
                      placeholder="https://example.com/recruit"
                      className="w-full mt-2 px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                      disabled={selectedUrl !== "custom" || isFetching}
                    />
                  </div>
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t">
                <Button
                  variant="outline"
                  onClick={closeUrlSelector}
                  disabled={isFetching}
                >
                  キャンセル
                </Button>
                <Button
                  onClick={handleConfirmUrl}
                  disabled={!selectedUrl || isFetching}
                >
                  {isFetching ? (
                    <>
                      <LoadingSpinner />
                      <span className="ml-2">取得中...</span>
                    </>
                  ) : (
                    "情報を取得"
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Result modal */}
      {showResult && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="max-w-md w-full">
            <CardHeader className="pb-3">
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
            </CardHeader>
            <CardContent className="space-y-4">
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
                        ? `残り${result.freeRemaining}回/日`
                        : `${result.creditsConsumed}クレジット`}
                    </span>
                  </div>

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

              <div className="flex justify-end pt-2">
                <Button onClick={closeResult}>閉じる</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );
}
