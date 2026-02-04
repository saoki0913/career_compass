"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getDeviceToken } from "@/lib/auth/device-token";

// Extended content types for dropdown (9 categories)
type ContentType =
  | "new_grad_recruitment"
  | "midcareer_recruitment"
  | "corporate_site"
  | "ir_materials"
  | "ceo_message"
  | "employee_interviews"
  | "press_release"
  | "csr_sustainability"
  | "midterm_plan";

interface CorporateInfoUrl {
  url: string;
  type?: "ir" | "business" | "about" | "general";  // Legacy type
  contentType?: ContentType;  // New classification
  fetchedAt?: string;
}

interface RagStatus {
  hasRag: boolean;
  totalChunks: number;
  // Content type counts (9 categories)
  newGradRecruitmentChunks: number;
  midcareerRecruitmentChunks: number;
  corporateSiteChunks: number;
  irMaterialsChunks: number;
  ceoMessageChunks: number;
  employeeInterviewsChunks: number;
  pressReleaseChunks: number;
  csrSustainabilityChunks: number;
  midtermPlanChunks: number;
  lastUpdated: string | null;
}

interface CorporateInfoStatus {
  companyId: string;
  corporateInfoUrls: CorporateInfoUrl[];
  corporateInfoFetchedAt: string | null;
  ragStatus: RagStatus;
  pageLimit: number;
}

interface SearchCandidate {
  url: string;
  title: string;
  snippet?: string;
  confidence: "high" | "medium" | "low";
  sourceType?: "official" | "job_site" | "other";
}

// Integrated badge labels
const INTEGRATED_BADGE_LABELS: Record<string, Record<string, string>> = {
  official: { high: "公式・高", medium: "公式・中", low: "公式・低" },
  job_site: { high: "就活サイト・高", medium: "就活サイト・中", low: "就活サイト・低" },
  other: { high: "関連・高", medium: "関連・中", low: "関連・低" },
};

const CONFIDENCE_BADGE_COLORS: Record<string, { bg: string; text: string }> = {
  high: { bg: "bg-emerald-100", text: "text-emerald-700" },
  medium: { bg: "bg-yellow-100", text: "text-yellow-700" },
  low: { bg: "bg-gray-100", text: "text-gray-600" },
};

const CONTENT_TYPE_TO_CHANNEL: Record<ContentType, "corporate_ir" | "corporate_general"> = {
  new_grad_recruitment: "corporate_general",
  midcareer_recruitment: "corporate_general",
  corporate_site: "corporate_general",
  ir_materials: "corporate_ir",
  ceo_message: "corporate_general",
  employee_interviews: "corporate_general",
  press_release: "corporate_general",
  csr_sustainability: "corporate_general",
  midterm_plan: "corporate_ir",
};

// Mapping from legacy type to new ContentType
const LEGACY_TO_NEW_TYPE: Record<string, ContentType> = {
  ir: "ir_materials",
  business: "corporate_site",
  about: "corporate_site",
  general: "corporate_site",
  recruitment_homepage: "new_grad_recruitment",  // Map legacy recruitment_homepage to new_grad
};

function mapLegacyToNew(legacyType: string): ContentType {
  return LEGACY_TO_NEW_TYPE[legacyType] || "corporate_site";
}

// Dropdown options for content types (9 categories)
const CONTENT_TYPE_OPTIONS: Array<{ value: ContentType; label: string }> = [
  { value: "new_grad_recruitment", label: "新卒採用ホームページ" },
  { value: "midcareer_recruitment", label: "中途採用ホームページ" },
  { value: "corporate_site", label: "企業HP（会社概要、事業内容、ニュース）" },
  { value: "ir_materials", label: "IR資料（有価証券報告書、決算説明資料）" },
  { value: "ceo_message", label: "社長メッセージ・挨拶" },
  { value: "employee_interviews", label: "社員インタビュー・ブログ記事" },
  { value: "press_release", label: "プレスリリース" },
  { value: "csr_sustainability", label: "CSR・サステナビリティレポート" },
  { value: "midterm_plan", label: "中期経営計画" },
];

interface CorporateInfoSectionProps {
  companyId: string;
  companyName: string;
  onUpdate?: () => void;
}

// Icons
const BuildingIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
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

const XIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
  </svg>
);

const CheckIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
  </svg>
);

const ExternalLinkIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
    />
  </svg>
);

const SparklesIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"
    />
  </svg>
);

const DatabaseIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4"
    />
  </svg>
);

const TrashIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
    />
  </svg>
);

const AlertTriangleIcon = () => (
  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
    />
  </svg>
);

// Content type labels for display
const CONTENT_TYPE_LABELS: Record<string, string> = {
  new_grad_recruitment: "新卒採用ホームページ",
  midcareer_recruitment: "中途採用ホームページ",
  recruitment_homepage: "採用ホームページ",  // Legacy
  corporate_site: "企業HP",
  ir_materials: "IR資料",
  ceo_message: "社長メッセージ",
  employee_interviews: "社員インタビュー",
  press_release: "プレスリリース",
  csr_sustainability: "CSR/サステナ",
  midterm_plan: "中期経営計画",
  structured: "構造化データ",
  // Legacy mappings
  ir: "IR情報",
  business: "事業紹介",
  about: "会社概要",
  general: "企業情報",
};

const CONTENT_TYPE_COLORS: Record<string, { bg: string; text: string }> = {
  new_grad_recruitment: { bg: "bg-blue-100", text: "text-blue-700" },
  midcareer_recruitment: { bg: "bg-sky-100", text: "text-sky-700" },
  recruitment_homepage: { bg: "bg-blue-100", text: "text-blue-700" },  // Legacy
  corporate_site: { bg: "bg-emerald-100", text: "text-emerald-700" },
  ir_materials: { bg: "bg-purple-100", text: "text-purple-700" },
  ceo_message: { bg: "bg-amber-100", text: "text-amber-700" },
  employee_interviews: { bg: "bg-pink-100", text: "text-pink-700" },
  press_release: { bg: "bg-cyan-100", text: "text-cyan-700" },
  csr_sustainability: { bg: "bg-green-100", text: "text-green-700" },
  midterm_plan: { bg: "bg-indigo-100", text: "text-indigo-700" },
  // Legacy colors
  ir: { bg: "bg-blue-100", text: "text-blue-700" },
  business: { bg: "bg-purple-100", text: "text-purple-700" },
  about: { bg: "bg-emerald-100", text: "text-emerald-700" },
  general: { bg: "bg-emerald-100", text: "text-emerald-700" },
};

// Stats cards configuration (9 categories, using ContentType keys for URL counting)
// Grouped stats card configurations for compact display
const STATS_GROUPS: Array<{
  groupName: string;
  items: Array<{
    key: ContentType;
    label: string;
    shortLabel: string;
    colorClass: string;
  }>;
}> = [
  {
    groupName: "採用情報",
    items: [
      { key: "new_grad_recruitment", label: "新卒採用HP", shortLabel: "新卒", colorClass: "bg-blue-50 border-blue-200" },
      { key: "midcareer_recruitment", label: "中途採用HP", shortLabel: "中途", colorClass: "bg-sky-50 border-sky-200" },
    ],
  },
  {
    groupName: "企業情報",
    items: [
      { key: "corporate_site", label: "企業HP", shortLabel: "企業HP", colorClass: "bg-emerald-50 border-emerald-200" },
      { key: "ir_materials", label: "IR資料", shortLabel: "IR", colorClass: "bg-purple-50 border-purple-200" },
    ],
  },
  {
    groupName: "コンテンツ",
    items: [
      { key: "ceo_message", label: "社長メッセージ", shortLabel: "社長", colorClass: "bg-amber-50 border-amber-200" },
      { key: "employee_interviews", label: "社員インタビュー", shortLabel: "社員", colorClass: "bg-pink-50 border-pink-200" },
      { key: "press_release", label: "プレスリリース", shortLabel: "プレス", colorClass: "bg-cyan-50 border-cyan-200" },
      { key: "csr_sustainability", label: "CSR/サステナ", shortLabel: "CSR", colorClass: "bg-green-50 border-green-200" },
      { key: "midterm_plan", label: "中期経営計画", shortLabel: "中計", colorClass: "bg-indigo-50 border-indigo-200" },
    ],
  },
];

// Flat list for backward compatibility
const STATS_CARD_CONFIGS = STATS_GROUPS.flatMap(g => g.items);

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

export function CorporateInfoSection({
  companyId,
  companyName,
  onUpdate,
}: CorporateInfoSectionProps) {
  const [status, setStatus] = useState<CorporateInfoStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal states
  const [showModal, setShowModal] = useState(false);
  const [showUrlModal, setShowUrlModal] = useState(false);
  const [showRagModal, setShowRagModal] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [isFetching, setIsFetching] = useState(false);
  const [candidates, setCandidates] = useState<SearchCandidate[]>([]);
  const [selectedUrls, setSelectedUrls] = useState<string[]>([]);
  const [customUrl, setCustomUrl] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [lastContentType, setLastContentType] = useState<ContentType | null>(null);
  const [selectedContentType, setSelectedContentType] = useState<ContentType | null>(null);
  const [fetchResult, setFetchResult] = useState<{
    success: boolean;
    pagesCrawled: number;
    chunksStored: number;
    errors: string[];
  } | null>(null);

  // Delete modal states
  const [selectedUrlsForDelete, setSelectedUrlsForDelete] = useState<Set<string>>(new Set());
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  // Whether the current search used relaxed (snippet) matching
  const [isRelaxedSearch, setIsRelaxedSearch] = useState(false);

  // Calculate URL counts by content type (9 categories)
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
      const type = url.contentType || (url.type ? mapLegacyToNew(url.type) : "corporate_site");
      counts[type] = (counts[type] || 0) + 1;
    }

    return counts;
  }, [status?.corporateInfoUrls]);

  const fetchStatus = useCallback(async () => {
    try {
      setIsLoading(true);
      const response = await fetch(`/api/companies/${companyId}/fetch-corporate`, {
        headers: buildHeaders(),
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error("Failed to fetch status");
      }

      const data = await response.json();
      setStatus(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load status");
    } finally {
      setIsLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const buildSearchQuery = (input: string) => {
    const trimmed = input.trim();
    if (!trimmed) {
      return "";
    }
    if (trimmed.toLowerCase().includes(companyName.toLowerCase())) {
      return trimmed;
    }
    return `${companyName} ${trimmed}`;
  };

  const detectContentType = (input: string): ContentType => {
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
  };

  const resolveContentChannel = (contentType?: ContentType | null): "corporate_ir" | "corporate_general" => {
    if (!contentType) {
      return "corporate_general";
    }
    return CONTENT_TYPE_TO_CHANNEL[contentType] || "corporate_general";
  };

  const buildDefaultSelections = (list: SearchCandidate[]) =>
    list
      .filter((candidate) => candidate.sourceType === "official" && candidate.confidence === "high")
      .map((candidate) => candidate.url);
  // Search by type (primary search method)
  const handleTypeSearch = async (allowSnippetMatch = false) => {
    if (!selectedContentType) {
      setError("タイプを選択してください");
      return;
    }

    setIsSearching(true);
    setError(null);
    setIsRelaxedSearch(allowSnippetMatch);

    setLastContentType(selectedContentType);

    try {
      const response = await fetch(`/api/companies/${companyId}/search-corporate-pages`, {
        method: "POST",
        headers: buildHeaders(),
        credentials: "include",
        body: JSON.stringify({
          contentType: selectedContentType,  // Pass ContentType for optimized search
          allowSnippetMatch,
        }),
      });

      if (!response.ok) {
        throw new Error("検索に失敗しました");
      }

      const data = await response.json();
      const nextCandidates = data.candidates || [];
      setCandidates(nextCandidates);
      setSelectedUrls(buildDefaultSelections(nextCandidates));
    } catch (err) {
      setError(err instanceof Error ? err.message : "検索に失敗しました");
    } finally {
      setIsSearching(false);
    }
  };

  // Custom search (optional advanced feature)
  const handleCustomSearch = async (allowSnippetMatch = false) => {
    if (!searchQuery.trim()) {
      setError("検索キーワードを入力してください");
      return;
    }

    setIsSearching(true);
    setError(null);
    setIsRelaxedSearch(allowSnippetMatch);

    const query = buildSearchQuery(searchQuery);
    const resolvedContentType = selectedContentType ?? detectContentType(query);
    setLastContentType(resolvedContentType);
    if (!selectedContentType) {
      setSelectedContentType(resolvedContentType);
    }

    try {
      const response = await fetch(`/api/companies/${companyId}/search-corporate-pages`, {
        method: "POST",
        headers: buildHeaders(),
        credentials: "include",
        body: JSON.stringify({
          customQuery: query,
          contentType: resolvedContentType,
          allowSnippetMatch,
        }),
      });

      if (!response.ok) {
        throw new Error("検索に失敗しました");
      }

      const data = await response.json();
      const nextCandidates = data.candidates || [];
      setCandidates(nextCandidates);
      setSelectedUrls(buildDefaultSelections(nextCandidates));
    } catch (err) {
      setError(err instanceof Error ? err.message : "検索に失敗しました");
    } finally {
      setIsSearching(false);
    }
  };

  const handleFetchCorporateInfo = async () => {
    const urlsToFetch = [...selectedUrls];
    if (customUrl.trim()) {
      urlsToFetch.push(customUrl.trim());
    }

    if (urlsToFetch.length === 0) {
      setError("URLを選択してください");
      return;
    }

    setIsFetching(true);
    setError(null);
    setFetchResult(null);

    try {
      const contentChannel = resolveContentChannel(lastContentType || selectedContentType);
      const contentType = lastContentType || selectedContentType; // 9-category type
      const response = await fetch(`/api/companies/${companyId}/fetch-corporate`, {
        method: "POST",
        headers: buildHeaders(),
        credentials: "include",
        body: JSON.stringify({
          urls: urlsToFetch,
          contentChannel, // legacy 3-category channel
          contentType, // 9-category content type for proper RAG counts
        }),
      });

      if (response.status === 402) {
        const data = await response.json();
        setError(data.error || "プラン制限に達しました");
        return;
      }

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "取得に失敗しました");
      }

      const result = await response.json();
      setFetchResult(result);

      // Refresh status
      await fetchStatus();
      onUpdate?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "取得に失敗しました");
    } finally {
      setIsFetching(false);
    }
  };

  const openModal = () => {
    setShowModal(true);
    setSelectedUrls([]);
    setCustomUrl("");
    setSearchQuery("");
    setCandidates([]);
    setFetchResult(null);
    setError(null);
    setSelectedContentType(null);
    setLastContentType(null);
    setIsRelaxedSearch(false);
  };

  const closeModal = () => {
    setShowModal(false);
    setFetchResult(null);
    setError(null);
  };

  const toggleUrl = (url: string) => {
    setSelectedUrls((prev) =>
      prev.includes(url) ? prev.filter((u) => u !== url) : [...prev, url]
    );
  };

  // Delete functionality
  const toggleUrlForDelete = (url: string) => {
    setSelectedUrlsForDelete((prev) => {
      const next = new Set(prev);
      if (next.has(url)) {
        next.delete(url);
      } else {
        next.add(url);
      }
      return next;
    });
  };

  const toggleSelectAllForDelete = () => {
    if (!status?.corporateInfoUrls) return;
    const allUrls = status.corporateInfoUrls.map((u) => u.url);
    if (selectedUrlsForDelete.size === allUrls.length) {
      setSelectedUrlsForDelete(new Set());
    } else {
      setSelectedUrlsForDelete(new Set(allUrls));
    }
  };

  const handleDeleteUrls = async () => {
    if (selectedUrlsForDelete.size === 0) return;

    setIsDeleting(true);
    setDeleteError(null);

    try {
      const response = await fetch(
        `/api/companies/${companyId}/delete-corporate-urls`,
        {
          method: "POST",
          headers: buildHeaders(),
          credentials: "include",
          body: JSON.stringify({
            urls: Array.from(selectedUrlsForDelete),
          }),
        }
      );

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "削除に失敗しました");
      }

      // Refresh status
      await fetchStatus();
      onUpdate?.();

      // Reset state
      setSelectedUrlsForDelete(new Set());
      setShowDeleteConfirm(false);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "削除に失敗しました");
    } finally {
      setIsDeleting(false);
    }
  };

  const openUrlModal = () => {
    setShowUrlModal(true);
    setSelectedUrlsForDelete(new Set());
    setDeleteError(null);
    setShowDeleteConfirm(false);
  };

  const closeUrlModal = () => {
    setShowUrlModal(false);
    setSelectedUrlsForDelete(new Set());
    setDeleteError(null);
    setShowDeleteConfirm(false);
  };

  const closeRagModal = () => {
    setShowRagModal(false);
  };

  if (isLoading) {
    return (
      <Card className="border-border/50">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <BuildingIcon />
            企業情報データベース
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <LoadingSpinner />
          </div>
        </CardContent>
      </Card>
    );
  }

  const ragStatus = status?.ragStatus;
  // Show stats if there are any URLs registered
  const hasAnyData = status?.corporateInfoUrls && status.corporateInfoUrls.length > 0;

  return (
    <>
      <Card className="border-border/50">
        <CardHeader className="flex flex-row items-center justify-between py-3">
          <CardTitle className="text-base flex items-center gap-2">
            <BuildingIcon />
            企業情報データベース
            {hasAnyData && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-medium">
                {status?.corporateInfoUrls?.length || 0}件登録
              </span>
            )}
          </CardTitle>
          <button
            onClick={openModal}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-border hover:bg-muted/50 transition-colors"
          >
            <SparklesIcon />
            <span className="text-sm font-medium">AIで企業情報を取得</span>
          </button>
        </CardHeader>
        <CardContent>
          {!hasAnyData ? (
            <div className="text-center py-6 text-muted-foreground">
              <p>まだ企業情報が登録されていません</p>
              <p className="text-sm mt-1">
                企業情報ページを取得して、ES添削の精度を向上させましょう
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Grouped URL counts - Compact layout */}
              {STATS_GROUPS.map((group) => {
                const groupTotal = group.items.reduce((sum, item) => sum + (urlCountsByType[item.key] || 0), 0);
                return (
                  <div key={group.groupName}>
                    <p className="text-xs font-medium text-muted-foreground mb-1.5 px-1">{group.groupName}</p>
                    <div className="flex flex-wrap gap-2">
                      {group.items.map((config) => {
                        const count = urlCountsByType[config.key] || 0;
                        const hasData = count > 0;
                        return (
                          <div
                            key={config.key}
                            className={cn(
                              "flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-colors",
                              hasData ? config.colorClass : "bg-muted/20 border-border/30"
                            )}
                            title={config.label}
                          >
                            <span className={cn(
                              "text-xs",
                              hasData ? "text-foreground" : "text-muted-foreground/60"
                            )}>
                              {config.shortLabel}
                            </span>
                            <span className={cn(
                              "text-sm font-semibold min-w-[1.25rem] text-center",
                              hasData ? "text-foreground" : "text-muted-foreground/40"
                            )}>
                              {count}
                            </span>
                            {hasData && (
                              <svg className="w-3 h-3 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                              </svg>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}

              {/* Footer: Last updated + URL modal */}
              <div className="pt-2 border-t border-border/50 flex items-center justify-between">
                <div className="text-xs text-muted-foreground">
                  {ragStatus?.lastUpdated && (
                    <span>
                      更新: {new Date(ragStatus.lastUpdated).toLocaleDateString("ja-JP", {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  )}
                </div>
                {status?.corporateInfoUrls && status.corporateInfoUrls.length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={openUrlModal}
                    className="text-xs h-7 px-2"
                  >
                    登録済みURL（{status.corporateInfoUrls.length}件）
                  </Button>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add Corporate Info Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="max-w-2xl w-full max-h-[85vh] overflow-y-auto">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">企業情報を取得</CardTitle>
                <button
                  type="button"
                  onClick={closeModal}
                  className="p-1 rounded-full hover:bg-muted transition-colors"
                  disabled={isFetching}
                >
                  <XIcon />
                </button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Success result */}
              {fetchResult && (
                <div
                  className={cn(
                    "p-4 rounded-lg",
                    fetchResult.success
                      ? "bg-emerald-50 border border-emerald-200"
                      : "bg-amber-50 border border-amber-200"
                  )}
                >
                  <div className="flex items-center gap-2 mb-2">
                    {fetchResult.success ? (
                      <>
                        <div className="w-6 h-6 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600">
                          <CheckIcon />
                        </div>
                        <span className="font-medium text-emerald-800">取得完了</span>
                      </>
                    ) : (
                      <>
                        <div className="w-6 h-6 rounded-full bg-amber-100 flex items-center justify-center text-amber-600">
                          <XIcon />
                        </div>
                        <span className="font-medium text-amber-800">一部取得失敗</span>
                      </>
                    )}
                  </div>
                  <div className="text-sm space-y-1">
                    <p>取得ページ数: {fetchResult.pagesCrawled}</p>
                    <p>保存チャンク数: {fetchResult.chunksStored}</p>
                    {fetchResult.errors.length > 0 && (
                      <div className="mt-2">
                        <p className="text-amber-700">エラー:</p>
                        <ul className="list-disc list-inside text-amber-700">
                          {fetchResult.errors.map((err, i) => (
                            <li key={i}>{err}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                  <Button onClick={closeModal} className="mt-3" size="sm">
                    閉じる
                  </Button>
                </div>
              )}

              {!fetchResult && (
                <>
                  <p className="text-sm text-muted-foreground">
                    {companyName} の企業情報を検索して、ES添削に使える情報を取得します
                  </p>

                  {/* Type Selection (Primary) */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium">タイプを選択</label>
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <select
                          value={selectedContentType || ""}
                          onChange={(e) => {
                            const value = e.target.value as ContentType | "";
                            setSelectedContentType(value ? (value as ContentType) : null);
                          }}
                          disabled={isSearching}
                          className={cn(
                            "w-full h-10 px-3 pr-8 rounded-md border text-sm cursor-pointer appearance-none",
                            "focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1",
                            "bg-background border-border hover:bg-muted"
                          )}
                        >
                          <option value="" disabled>
                            タイプを選択してください
                          </option>
                          {CONTENT_TYPE_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                        <svg
                          className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none text-muted-foreground"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                      <Button
                        onClick={() => handleTypeSearch()}
                        disabled={!selectedContentType || isSearching}
                      >
                        {isSearching ? <LoadingSpinner /> : "検索"}
                      </Button>
                    </div>
                  </div>

                  {error && (
                    <div className="p-3 bg-red-50 rounded-lg border border-red-200">
                      <p className="text-sm text-red-800">{error}</p>
                    </div>
                  )}

                  {/* Page limit info */}
                  {status && (
                    <p className="text-xs text-muted-foreground">
                      プラン上限: {status.pageLimit}ページ / 選択中: {selectedUrls.length + (customUrl ? 1 : 0)}ページ
                    </p>
                  )}

                  {/* Search results */}
                  {candidates.length > 0 && (
                    <div className="space-y-2 max-h-[30vh] overflow-y-auto">
                      {candidates.map((candidate, index) => (
                        <label
                          key={index}
                          className="flex items-start gap-3 p-3 border rounded-lg cursor-pointer hover:bg-muted/50 transition-colors"
                        >
                          <input
                            type="checkbox"
                            checked={selectedUrls.includes(candidate.url)}
                            onChange={() => toggleUrl(candidate.url)}
                            className="mt-1"
                            disabled={isFetching}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-medium truncate">{candidate.title}</span>
                              {(() => {
                                const sourceType = candidate.sourceType || "other";
                                const confidence = candidate.confidence || "low";
                                const label = INTEGRATED_BADGE_LABELS[sourceType]?.[confidence] || "関連・低";
                                const colors = CONFIDENCE_BADGE_COLORS[confidence] || { bg: "bg-gray-100", text: "text-gray-600" };
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
                            <p className="text-xs text-muted-foreground mt-1 truncate">
                              {candidate.url}
                            </p>
                          </div>
                        </label>
                      ))}
                    </div>
                  )}

                  {/* Empty state with relaxed search option */}
                  {candidates.length === 0 && !isSearching && selectedContentType && (
                    <div className="text-center py-6 space-y-3">
                      <p className="text-sm text-muted-foreground">
                        {isRelaxedSearch
                          ? "該当するページが見つかりませんでした。カスタム検索またはURLを直接入力してください。"
                          : "該当するページが見つかりませんでした。"}
                      </p>
                      {!isRelaxedSearch && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleTypeSearch(true)}
                          disabled={isSearching || isFetching}
                        >
                          条件を緩和して再検索
                        </Button>
                      )}
                    </div>
                  )}

                  {/* Advanced Options (Collapsible) */}
                  <details className="border rounded-lg">
                    <summary className="px-3 py-2 text-sm font-medium cursor-pointer hover:bg-muted/50">
                      詳細オプション
                    </summary>
                    <div className="px-3 pb-3 space-y-3 border-t">
                      {/* Custom Search */}
                      <div className="pt-3">
                        <label className="text-sm text-muted-foreground">カスタム検索</label>
                        <div className="flex gap-2 mt-1">
                          <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder={`例: ${companyName} 社員インタビュー`}
                            className="flex-1 px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                            disabled={isSearching}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && searchQuery.trim()) {
                                handleCustomSearch();
                              }
                            }}
                          />
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleCustomSearch()}
                            disabled={isSearching || !searchQuery.trim()}
                          >
                            {isSearching ? <LoadingSpinner /> : "検索"}
                          </Button>
                        </div>
                      </div>
                      {/* Custom URL */}
                      <div>
                        <label className="text-sm text-muted-foreground">カスタムURL</label>
                        <input
                          type="url"
                          value={customUrl}
                          onChange={(e) => setCustomUrl(e.target.value)}
                          placeholder="https://..."
                          className="w-full mt-1 px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                          disabled={isFetching}
                        />
                      </div>
                    </div>
                  </details>

                  {/* Actions */}
                  <div className="flex justify-end gap-2 pt-4 border-t">
                    <Button variant="outline" onClick={closeModal} disabled={isFetching}>
                      キャンセル
                    </Button>
                    <Button
                      onClick={handleFetchCorporateInfo}
                      disabled={
                        isFetching ||
                        (selectedUrls.length === 0 && !customUrl.trim())
                      }
                    >
                      {isFetching ? (
                        <>
                          <LoadingSpinner />
                          <span className="ml-2">取得中...</span>
                        </>
                      ) : (
                        "企業情報を取得"
                      )}
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Registered URLs Modal */}
      {showUrlModal && status?.corporateInfoUrls && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="max-w-2xl w-full max-h-[80vh] overflow-hidden">
            <CardHeader className="pb-3 border-b">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">登録済みURL</CardTitle>
                <button
                  type="button"
                  onClick={closeUrlModal}
                  className="p-1 rounded-full hover:bg-muted transition-colors"
                  disabled={isDeleting}
                >
                  <XIcon />
                </button>
              </div>
            </CardHeader>
            <CardContent className="py-4 overflow-y-auto max-h-[60vh]">
              {status.corporateInfoUrls.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  登録済みのURLはありません
                </p>
              ) : (
                <div className="space-y-3">
                  {/* Select All Toggle */}
                  <div className="flex items-center gap-3 pb-3 border-b">
                    <button
                      type="button"
                      onClick={toggleSelectAllForDelete}
                      disabled={isDeleting}
                      className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <span
                        className={cn(
                          "w-5 h-5 rounded border-2 flex items-center justify-center transition-colors",
                          selectedUrlsForDelete.size === status.corporateInfoUrls.length
                            ? "bg-primary border-primary text-primary-foreground"
                            : "border-muted-foreground/40"
                        )}
                      >
                        {selectedUrlsForDelete.size === status.corporateInfoUrls.length && (
                          <CheckIcon />
                        )}
                      </span>
                      すべて選択
                    </button>
                    {selectedUrlsForDelete.size > 0 && (
                      <span className="text-sm text-muted-foreground">
                        ({selectedUrlsForDelete.size}件選択中)
                      </span>
                    )}
                  </div>

                  {/* URL List */}
                  {status.corporateInfoUrls.map((urlInfo, i) => {
                    // Use contentType if available, otherwise map from legacy type
                    const resolvedType = urlInfo.contentType || (urlInfo.type ? mapLegacyToNew(urlInfo.type) : "corporate_site");
                    const colors = CONTENT_TYPE_COLORS[resolvedType] || {
                      bg: "bg-gray-100",
                      text: "text-gray-700",
                    };
                    const label = CONTENT_TYPE_LABELS[resolvedType] || resolvedType;
                    const isSelected = selectedUrlsForDelete.has(urlInfo.url);

                    return (
                      <div
                        key={i}
                        className={cn(
                          "flex items-start gap-3 p-3 rounded-lg border transition-colors",
                          isSelected ? "bg-red-50/50 border-red-200" : "bg-muted/30"
                        )}
                      >
                        {/* Checkbox */}
                        <button
                          type="button"
                          onClick={() => toggleUrlForDelete(urlInfo.url)}
                          disabled={isDeleting}
                          className="flex-shrink-0 mt-0.5"
                        >
                          <span
                            className={cn(
                              "w-5 h-5 rounded border-2 flex items-center justify-center transition-colors",
                              isSelected
                                ? "bg-red-500 border-red-500 text-white"
                                : "border-muted-foreground/40 hover:border-muted-foreground"
                            )}
                          >
                            {isSelected && <CheckIcon />}
                          </span>
                        </button>

                        <span
                          className={cn(
                            "text-xs px-2 py-0.5 rounded-full flex-shrink-0 mt-0.5",
                            colors.bg,
                            colors.text
                          )}
                        >
                          {label}
                        </span>
                        <div className="flex-1 min-w-0">
                          <a
                            href={urlInfo.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm text-primary hover:underline break-all flex items-center gap-1"
                          >
                            <span className="truncate">{urlInfo.url}</span>
                            <ExternalLinkIcon />
                          </a>
                          {urlInfo.fetchedAt && (
                            <p className="text-xs text-muted-foreground mt-1">
                              取得日時:{" "}
                              {new Date(urlInfo.fetchedAt).toLocaleDateString("ja-JP", {
                                year: "numeric",
                                month: "short",
                                day: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {/* Delete Error */}
                  {deleteError && (
                    <div className="p-3 bg-red-50 rounded-lg border border-red-200">
                      <p className="text-sm text-red-800">{deleteError}</p>
                    </div>
                  )}
                </div>
              )}
            </CardContent>

            {/* Footer */}
            <div className="px-6 py-3 border-t bg-muted/30 flex gap-3">
              <Button
                variant="outline"
                className="flex-1"
                onClick={closeUrlModal}
                disabled={isDeleting}
              >
                閉じる
              </Button>
              {selectedUrlsForDelete.size > 0 && (
                <Button
                  variant="destructive"
                  className="flex-1"
                  onClick={() => setShowDeleteConfirm(true)}
                  disabled={isDeleting}
                >
                  <TrashIcon />
                  <span className="ml-1.5">{selectedUrlsForDelete.size}件を削除</span>
                </Button>
              )}
            </div>
          </Card>
        </div>
      )}

      {/* RAG Status Modal */}
      {showRagModal && ragStatus && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="max-w-md w-full">
            <CardHeader className="pb-3 border-b">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">RAG詳細</CardTitle>
                <button
                  type="button"
                  onClick={closeRagModal}
                  className="p-1 rounded-full hover:bg-muted transition-colors"
                >
                  <XIcon />
                </button>
              </div>
            </CardHeader>
            <CardContent className="py-4 space-y-3">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="flex items-center justify-between rounded-md border px-3 py-2">
                  <span className="text-muted-foreground">新卒採用HP</span>
                  <span className="font-medium">{ragStatus.newGradRecruitmentChunks}</span>
                </div>
                <div className="flex items-center justify-between rounded-md border px-3 py-2">
                  <span className="text-muted-foreground">中途採用HP</span>
                  <span className="font-medium">{ragStatus.midcareerRecruitmentChunks}</span>
                </div>
                <div className="flex items-center justify-between rounded-md border px-3 py-2">
                  <span className="text-muted-foreground">企業HP</span>
                  <span className="font-medium">{ragStatus.corporateSiteChunks}</span>
                </div>
                <div className="flex items-center justify-between rounded-md border px-3 py-2">
                  <span className="text-muted-foreground">IR資料</span>
                  <span className="font-medium">{ragStatus.irMaterialsChunks}</span>
                </div>
                <div className="flex items-center justify-between rounded-md border px-3 py-2">
                  <span className="text-muted-foreground">社長メッセージ</span>
                  <span className="font-medium">{ragStatus.ceoMessageChunks}</span>
                </div>
                <div className="flex items-center justify-between rounded-md border px-3 py-2">
                  <span className="text-muted-foreground">社員インタビュー</span>
                  <span className="font-medium">{ragStatus.employeeInterviewsChunks}</span>
                </div>
                <div className="flex items-center justify-between rounded-md border px-3 py-2">
                  <span className="text-muted-foreground">プレスリリース</span>
                  <span className="font-medium">{ragStatus.pressReleaseChunks}</span>
                </div>
                <div className="flex items-center justify-between rounded-md border px-3 py-2">
                  <span className="text-muted-foreground">CSR/サステナ</span>
                  <span className="font-medium">{ragStatus.csrSustainabilityChunks}</span>
                </div>
                <div className="flex items-center justify-between rounded-md border px-3 py-2">
                  <span className="text-muted-foreground">中期経営計画</span>
                  <span className="font-medium">{ragStatus.midtermPlanChunks}</span>
                </div>
              </div>
              {ragStatus.lastUpdated && (
                <p className="text-xs text-muted-foreground text-right">
                  更新:{" "}
                  {new Date(ragStatus.lastUpdated).toLocaleDateString("ja-JP", {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              )}
              <div className="flex justify-end pt-2">
                <Button onClick={closeRagModal}>閉じる</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[60] p-4">
          <Card className="max-w-md w-full">
            <CardContent className="pt-6">
              <div className="flex flex-col items-center text-center">
                <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center text-red-600 mb-4">
                  <AlertTriangleIcon />
                </div>
                <h3 className="text-lg font-semibold mb-2">URLを削除しますか？</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  選択した{selectedUrlsForDelete.size}件のURLと、それに関連するRAGデータが削除されます。
                  この操作は取り消せません。
                </p>
                {deleteError && (
                  <div className="w-full p-3 mb-4 bg-red-50 rounded-lg border border-red-200">
                    <p className="text-sm text-red-800">{deleteError}</p>
                  </div>
                )}
                <div className="flex gap-3 w-full">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => setShowDeleteConfirm(false)}
                    disabled={isDeleting}
                  >
                    キャンセル
                  </Button>
                  <Button
                    variant="destructive"
                    className="flex-1"
                    onClick={handleDeleteUrls}
                    disabled={isDeleting}
                  >
                    {isDeleting ? (
                      <>
                        <LoadingSpinner />
                        <span className="ml-2">削除中...</span>
                      </>
                    ) : (
                      "削除する"
                    )}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );
}
