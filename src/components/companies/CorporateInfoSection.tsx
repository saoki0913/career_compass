"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAuth } from "@/components/auth/AuthProvider";
import { useCredits } from "@/hooks/useCredits";
import { useOperationLock } from "@/hooks/useOperationLock";
import { notifyMessage, notifySuccess } from "@/lib/notifications";
import {
  isUploadSource,
  type ContentType,
  type CorporateInfoSource as CorporateInfoUrl,
  type CorporateInfoSourceStatus,
} from "@/lib/company-info/sources";
import {
  CONFIDENCE_META,
  SOURCE_TYPE_META,
  normalizeSourceConfidence,
} from "@/lib/company-info/source-badges";
import { calculatePdfIngestCredits } from "@/lib/company-info/pricing";
import { getPdfPageCountFromFile } from "@/lib/company-info/pdf-page-count";
import {
  getRagPdfIngestPolicySummaryJa,
  getRagPdfMaxIngestPages,
} from "@/lib/company-info/pdf-ingest-limits";
import { parseApiErrorResponse, toAppUiError } from "@/lib/api-errors";
import { shouldCloseCorporateFetchModalOnSuccess } from "@/lib/company-info/fetch-ui";

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
  sourceType?: "official" | "job_site" | "parent" | "subsidiary" | "blog" | "other";
  relationCompanyName?: string | null;
  complianceStatus?: "allowed" | "warning" | "blocked";
  complianceReasons?: string[];
}

interface ComplianceCheckResponse {
  blockedResults: Array<{ url: string; reasons: string[] }>;
  warningResults: Array<{ url: string; reasons: string[] }>;
}

const SURFACE_CLASS = "rounded-xl border border-border/60 bg-background";
const FIELD_CLASS =
  "h-10 w-full rounded-lg border border-border bg-background px-3 text-sm transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20";

/** モーダル段階切り替えアニメ（200ms）の直後にスナックバーを出して、画面の急な切り替わりを和らげる */
const RAG_SUCCESS_SNACKBAR_DELAY_MS = 230;

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

type PdfUploadContentType =
  | "new_grad_recruitment"
  | "midcareer_recruitment"
  | "corporate_site"
  | "ir_materials"
  | "employee_interviews"
  | "csr_sustainability"
  | "midterm_plan";

const PDF_UPLOAD_CONTENT_TYPE_OPTIONS: Array<{ value: PdfUploadContentType; label: string }> = [
  { value: "ir_materials", label: "IR資料・決算資料" },
  { value: "midterm_plan", label: "中期経営計画・経営方針" },
  { value: "new_grad_recruitment", label: "採用資料・会社説明会資料" },
  { value: "employee_interviews", label: "社員紹介・カルチャー資料" },
  { value: "csr_sustainability", label: "サステナ・CSR資料" },
  { value: "corporate_site", label: "会社概要・その他" },
];

const DEFAULT_PDF_UPLOAD_CONTENT_TYPE: PdfUploadContentType = "corporate_site";

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

type InputMode = "web" | "url" | "pdf";
type ModalStep = "configure" | "review" | "result";
type WebModalStep = Exclude<ModalStep, "result">;
type WebSearchKind = "type" | "custom";
type BatchUploadItem = {
  fileName: string;
  status: "completed" | "pending" | "failed" | "skipped_limit";
  sourceUrl?: string;
  chunksStored?: number;
  extractedChars?: number;
  pageCount?: number | null;
  ingestUnits?: number;
  freeUnitsApplied?: number;
  creditsConsumed?: number;
  actualCreditsDeducted?: number;
  extractionMethod?: string;
  contentType?: ContentType | null;
  secondaryContentTypes?: ContentType[];
  error?: string;
  sourceTotalPages?: number | null;
  ingestTruncated?: boolean;
  ocrTruncated?: boolean;
  processingNoticeJa?: string | null;
};
type PdfFileStatus = "waiting" | "uploading" | "completed" | "failed";

interface PdfFileProgress {
  file: File;
  status: PdfFileStatus;
  error?: string;
  result?: BatchUploadItem;
}

interface FetchResult {
  success: boolean;
  pagesCrawled: number;
  chunksStored: number;
  errors: string[];
  actualUnits?: number;
  freeUnitsApplied?: number;
  remainingFreeUnits?: number;
  creditsConsumed?: number;
  actualCreditsDeducted?: number;
  estimatedCostBand?: string;
  totalUnits?: number;
  sourceLabel?: string;
  extractionMethod?: string;
  extractedChars?: number;
  summary?: {
    total: number;
    completed: number;
    pending: number;
    failed: number;
    skippedLimit: number;
  };
  items?: BatchUploadItem[];
}

interface WebDraft {
  selectedContentType: ContentType | null;
  lastContentType: ContentType | null;
  searchQuery: string;
  candidates: SearchCandidate[];
  selectedUrls: string[];
  hasSearched: boolean;
  isRelaxedSearch: boolean;
  lastWebSearchKind: WebSearchKind | null;
  step: WebModalStep;
}

interface UrlDraft {
  customUrlInput: string;
}

interface PdfDraft {
  uploadFiles: File[];
  uploadFileContentTypes: Record<string, PdfUploadContentType>;
}

function createInitialWebDraft(): WebDraft {
  return {
    selectedContentType: null,
    lastContentType: null,
    searchQuery: "",
    candidates: [],
    selectedUrls: [],
    hasSearched: false,
    isRelaxedSearch: false,
    lastWebSearchKind: null,
    step: "configure",
  };
}

function createInitialUrlDraft(): UrlDraft {
  return {
    customUrlInput: "",
  };
}

function createInitialPdfDraft(): PdfDraft {
  return {
    uploadFiles: [],
    uploadFileContentTypes: {},
  };
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

const LoadingSpinner = ({ className }: { className?: string }) => (
  <svg className={cn("h-5 w-5 animate-spin", className)} fill="none" viewBox="0 0 24 24">
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

const ArrowLeftIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M15 19l-7-7 7-7"
    />
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

const GlobeIcon = () => (
  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
  </svg>
);

const LinkIcon = () => (
  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
  </svg>
);

const FileUploadIcon = () => (
  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
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
  return {
    "Content-Type": "application/json",
  };
}

function mergePdfFiles(nextFiles: FileList | File[] | null | undefined, currentFiles: File[]) {
  if (!nextFiles) return currentFiles;
  const merged = [...currentFiles];
  const files = Array.from(nextFiles);
  for (const file of files) {
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      continue;
    }
    const exists = merged.some(
      (current) =>
        current.name === file.name &&
        current.size === file.size &&
        current.lastModified === file.lastModified
    );
    if (!exists) {
      merged.push(file);
    }
  }
  return merged;
}

function removePdfFile(files: File[], target: File) {
  return files.filter(
    (file) =>
      !(
        file.name === target.name &&
        file.size === target.size &&
        file.lastModified === target.lastModified
      )
  );
}

function pdfFileKey(file: File) {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

export function getExtractionMethodLabel(method?: string) {
  switch (method) {
    case "pypdf":
      return "PDF内の埋め込みテキストを抽出";
    case "ocr":
    case "openai_pdf_ocr":
      return "OCRで本文を抽出";
    case "ocr_high_accuracy":
      return "高精度OCRで本文を抽出";
    case "deferred_ocr":
      return "遅延OCR（廃止・旧データ）";
    default:
      return method || "不明";
  }
}

function getPdfUploadContentTypeLabel(value: PdfUploadContentType) {
  const option = PDF_UPLOAD_CONTENT_TYPE_OPTIONS.find((entry) => entry.value === value);
  return option?.label || "会社概要・その他";
}

function mergePdfDraftFiles(prev: PdfDraft, nextFiles: FileList | File[] | null | undefined): PdfDraft {
  if (!nextFiles) return prev;
  const mergedFiles = mergePdfFiles(nextFiles, prev.uploadFiles);
  const nextContentTypes = { ...prev.uploadFileContentTypes };
  const mergedKeys = new Set(mergedFiles.map(pdfFileKey));

  for (const file of mergedFiles) {
    const key = pdfFileKey(file);
    if (!nextContentTypes[key]) {
      nextContentTypes[key] = DEFAULT_PDF_UPLOAD_CONTENT_TYPE;
    }
  }

  for (const key of Object.keys(nextContentTypes)) {
    if (!mergedKeys.has(key)) {
      delete nextContentTypes[key];
    }
  }

  return {
    uploadFiles: mergedFiles,
    uploadFileContentTypes: nextContentTypes,
  };
}

function removePdfDraftFile(prev: PdfDraft, target: File): PdfDraft {
  const nextContentTypes = { ...prev.uploadFileContentTypes };
  delete nextContentTypes[pdfFileKey(target)];

  return {
    uploadFiles: removePdfFile(prev.uploadFiles, target),
    uploadFileContentTypes: nextContentTypes,
  };
}

function getSourceStatusMeta(status?: CorporateInfoSourceStatus) {
  switch (status) {
    case "pending":
      return {
        label: "OCR保留",
        className: "border-amber-200/80 bg-amber-50 text-amber-700",
      };
    case "processing":
      return {
        label: "処理中",
        className: "border-sky-200/80 bg-sky-50 text-sky-700",
      };
    case "failed":
      return {
        label: "失敗",
        className: "border-destructive/20 bg-destructive/5 text-destructive",
      };
    default:
      return {
        label: "完了",
        className: "border-emerald-200/80 bg-emerald-50 text-emerald-700",
      };
  }
}

function getBatchItemStatusMeta(status: NonNullable<FetchResult["items"]>[number]["status"]) {
  switch (status) {
    case "pending":
      return {
        label: "OCR保留",
        className: "border-amber-200/80 bg-amber-50 text-amber-700",
      };
    case "failed":
      return {
        label: "失敗",
        className: "border-destructive/20 bg-destructive/5 text-destructive",
      };
    case "skipped_limit":
      return {
        label: "上限超過",
        className: "border-zinc-200/80 bg-zinc-50 text-zinc-700",
      };
    default:
      return {
        label: "完了",
        className: "border-emerald-200/80 bg-emerald-50 text-emerald-700",
      };
  }
}

function getPdfFileStatusMeta(status: PdfFileStatus) {
  switch (status) {
    case "uploading":
      return { label: "取り込み中...", className: "text-sky-700" };
    case "completed":
      return { label: "完了", className: "text-emerald-700" };
    case "failed":
      return { label: "失敗", className: "text-destructive" };
    default:
      return { label: "待機中", className: "text-muted-foreground" };
  }
}

function formatTimestamp(
  value?: string | null,
  options?: Intl.DateTimeFormatOptions
) {
  if (!value) return null;
  return new Date(value).toLocaleDateString(
    "ja-JP",
    options || {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }
  );
}

function getHostLabel(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function truncateText(text?: string, maxLength = 140) {
  if (!text) return null;
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return null;
  return normalized.length > maxLength
    ? `${normalized.slice(0, maxLength)}…`
    : normalized;
}

function parseUrlListInput(input: string) {
  const rawLines = input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const uniqueUrls: string[] = [];
  const seen = new Set<string>();
  const invalidLines: Array<{ lineNumber: number; value: string }> = [];

  rawLines.forEach((value, index) => {
    try {
      const parsed = new URL(value);
      if (!["http:", "https:"].includes(parsed.protocol)) {
        throw new Error("invalid protocol");
      }
      const normalized = parsed.toString();
      if (!seen.has(normalized)) {
        seen.add(normalized);
        uniqueUrls.push(normalized);
      }
    } catch {
      invalidLines.push({ lineNumber: index + 1, value });
    }
  });

  return {
    urls: uniqueUrls,
    invalidLines,
    totalLines: rawLines.length,
  };
}

function formatCandidateUrl(url: string, maxLength = 56) {
  try {
    const parsed = new URL(url);
    const path = `${parsed.pathname}${parsed.search}` || "/";
    const compact = `${parsed.hostname}${path === "/" ? "" : path}`;
    return compact.length > maxLength
      ? `${compact.slice(0, maxLength)}…`
      : compact;
  } catch {
    return truncateText(url, maxLength) || url;
  }
}

function isRecommendedCandidate(candidate: SearchCandidate) {
  return candidate.sourceType === "official" && candidate.confidence === "high";
}

export function CorporateInfoSection({
  companyId,
  companyName,
  onUpdate,
}: CorporateInfoSectionProps) {
  const { isAuthenticated, isReady: isAuthReady } = useAuth();
  const { companyRagUnitsLimit, companyRagUnitsRemaining, plan, ragPdfLimits } = useCredits({
    isAuthenticated,
    isAuthReady,
  });
  const paidPdfPlan = plan === "standard" || plan === "pro" ? plan : "free";
  const maxPdfIngestPages =
    ragPdfLimits?.maxPagesIngest ?? getRagPdfMaxIngestPages(paidPdfPlan);
  const ragPdfPolicySummaryJa =
    ragPdfLimits?.summaryJa ?? getRagPdfIngestPolicySummaryJa(paidPdfPlan);
  const { isLocked, acquireLock, releaseLock } = useOperationLock();
  const [status, setStatus] = useState<CorporateInfoStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal states
  const [showModal, setShowModal] = useState(false);
  const [showUrlModal, setShowUrlModal] = useState(false);
  const [showRagModal, setShowRagModal] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [isFetching, setIsFetching] = useState(false);
  const [webDraft, setWebDraft] = useState<WebDraft>(createInitialWebDraft);
  const [urlDraft, setUrlDraft] = useState<UrlDraft>(createInitialUrlDraft);
  const [pdfDraft, setPdfDraft] = useState<PdfDraft>(createInitialPdfDraft);
  const [fetchResult, setFetchResult] = useState<FetchResult | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [pdfUploadProgress, setPdfUploadProgress] = useState<PdfFileProgress[] | null>(null);
  const [pdfPageEstimates, setPdfPageEstimates] = useState<Record<string, number | null>>({});
  const [pdfPageEstimatesPending, setPdfPageEstimatesPending] = useState(false);
  const [displayedStep, setDisplayedStep] = useState<ModalStep>("configure");
  const [isStepTransitioning, setIsStepTransitioning] = useState(false);

  // Delete modal states
  const [selectedUrlsForDelete, setSelectedUrlsForDelete] = useState<Set<string>>(new Set());
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [inputMode, setInputMode] = useState<InputMode>("web");
  const [modalStep, setModalStep] = useState<ModalStep>("configure");

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
      const type = url.contentType || (url.type ? mapLegacyToNew(url.type) : null);
      if (!type) {
        continue;
      }
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
    if (!status?.corporateInfoUrls) {
      return { pending: 0, processing: 0, failed: 0 };
    }

    return status.corporateInfoUrls.reduce(
      (acc, source) => {
        if (source.status === "pending") acc.pending += 1;
        if (source.status === "processing") acc.processing += 1;
        if (source.status === "failed") acc.failed += 1;
        return acc;
      },
      { pending: 0, processing: 0, failed: 0 }
    );
  }, [status?.corporateInfoUrls]);

  const parsedCustomUrls = useMemo(
    () => parseUrlListInput(urlDraft.customUrlInput),
    [urlDraft.customUrlInput]
  );

  const pdfUploadFileSignature = useMemo(
    () => pdfDraft.uploadFiles.map(pdfFileKey).join("|"),
    [pdfDraft.uploadFiles],
  );

  useEffect(() => {
    const files = pdfDraft.uploadFiles;
    if (files.length === 0) {
      setPdfPageEstimates({});
      setPdfPageEstimatesPending(false);
      return;
    }
    let cancelled = false;
    setPdfPageEstimatesPending(true);
    void (async () => {
      const results = await Promise.all(
        files.map(async (file) => {
          const key = pdfFileKey(file);
          const count = await getPdfPageCountFromFile(file);
          return [key, count] as const;
        }),
      );
      if (cancelled) return;
      setPdfPageEstimates(Object.fromEntries(results));
      setPdfPageEstimatesPending(false);
    })();
    return () => {
      cancelled = true;
    };
    // 再取得は「選択ファイル集合」のシグネチャが変わったときのみ（配列参照の変化で二重取得しない）
    // eslint-disable-next-line react-hooks/exhaustive-deps -- pdfUploadFileSignature が uploadFiles の内容を表す
  }, [pdfUploadFileSignature]);

  const pdfCreditPreview = useMemo(() => {
    const files = pdfDraft.uploadFiles;
    if (files.length === 0) return null;
    const keys = files.map(pdfFileKey);
    if (pdfPageEstimatesPending || keys.some((k) => pdfPageEstimates[k] === undefined)) {
      return { kind: "loading" as const };
    }
    const counts = keys.map((k) => pdfPageEstimates[k] as number | null);
    if (counts.some((c) => c === null)) {
      return { kind: "partial" as const };
    }
    const nums = counts as number[];
    const totalPages = nums.reduce((a, b) => a + b, 0);
    const effectivePages = nums.map((p) => Math.min(p, maxPdfIngestPages));
    let remainingFree = Math.max(0, companyRagUnitsRemaining ?? 0);
    let totalFreeFromQuota = 0;
    for (const p of effectivePages) {
      const applied = Math.min(p, remainingFree);
      totalFreeFromQuota += applied;
      remainingFree -= applied;
    }
    const effectiveTotal = effectivePages.reduce((a, b) => a + b, 0);
    const totalCredits = effectivePages.reduce(
      (sum, p) => sum + calculatePdfIngestCredits(p),
      0,
    );
    const willTruncateIngest = nums.some((p) => p > maxPdfIngestPages);
    return {
      kind: "ready" as const,
      totalPages,
      effectiveTotalPages: effectiveTotal,
      totalFreeFromQuota,
      totalCredits,
      willTruncateIngest,
      maxPdfIngestPages,
    };
  }, [
    pdfDraft.uploadFiles,
    pdfPageEstimates,
    pdfPageEstimatesPending,
    companyRagUnitsRemaining,
    maxPdfIngestPages,
  ]);

  const orderedCandidates = useMemo(
    () => [
      ...webDraft.candidates.filter((candidate) => isRecommendedCandidate(candidate)),
      ...webDraft.candidates.filter((candidate) => !isRecommendedCandidate(candidate)),
    ],
    [webDraft.candidates]
  );
  const allCandidateUrls = useMemo(
    () => webDraft.candidates.map((candidate) => candidate.url),
    [webDraft.candidates]
  );
  const resolvedWebContentType = webDraft.lastContentType || webDraft.selectedContentType;

  const activeModalStep: ModalStep = fetchResult ? "result" : modalStep;
  const isResultDisplayed = displayedStep === "result";
  const showWebReviewStep = inputMode === "web" && activeModalStep === "review";
  const showConfigureStep = activeModalStep === "configure";
  const isModalBusy = isSearching || isFetching || isUploading;
  const hasReviewContext = webDraft.hasSearched || webDraft.candidates.length > 0;
  const hasPendingPdfJobs = useMemo(
    () =>
      status?.corporateInfoUrls?.some(
        (entry) => entry.status === "pending" || entry.status === "processing"
      ) ?? false,
    [status?.corporateInfoUrls]
  );

  const isStepNavigable = useCallback(
    (step: ModalStep) => {
      if (isModalBusy) {
        return false;
      }

      switch (step) {
        case "configure":
          return true;
        case "review":
          return hasReviewContext;
        case "result":
          return activeModalStep === "result";
        default:
          return false;
      }
    },
    [activeModalStep, hasReviewContext, isModalBusy]
  );

  const handleStepNavigation = useCallback(
    (step: ModalStep) => {
      if (!isStepNavigable(step) || step === activeModalStep) {
        return;
      }

      if (step !== "result" && fetchResult) {
        setFetchResult(null);
      }

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
    [activeModalStep, fetchResult, inputMode, isStepNavigable]
  );

  const fetchStatus = useCallback(async (background = false) => {
    try {
      if (!background) {
        setIsLoading(true);
      }
      const response = await fetch(`/api/companies/${companyId}/fetch-corporate`, {
        headers: buildHeaders(),
        credentials: "include",
      });

      if (!response.ok) {
        throw await parseApiErrorResponse(
          response,
          {
            code: "CORPORATE_STATUS_FETCH_FAILED",
            userMessage: "企業情報の状態を読み込めませんでした。",
            action: "ページを再読み込みして、もう一度お試しください。",
            retryable: true,
          },
          "CorporateInfoSection.fetchStatus"
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
        "CorporateInfoSection.fetchStatus"
      );
      setError(uiError.message);
    } finally {
      if (!background) {
        setIsLoading(false);
      }
    }
  }, [companyId]);

  useEffect(() => {
    void fetchStatus();
  }, [fetchStatus]);

  useEffect(() => {
    if (!hasPendingPdfJobs) {
      return;
    }

    const timer = window.setInterval(() => {
      void fetchStatus(true);
    }, 10_000);

    return () => window.clearInterval(timer);
  }, [fetchStatus, hasPendingPdfJobs]);

  useEffect(() => {
    if (!showModal || activeModalStep === displayedStep) {
      return;
    }

    setIsStepTransitioning(true);
    const timer = window.setTimeout(() => {
      setDisplayedStep(activeModalStep);
      setIsStepTransitioning(false);
    }, 200);

    return () => window.clearTimeout(timer);
  }, [activeModalStep, displayedStep, showModal]);

  useEffect(() => {
    if (showModal && displayedStep === "result" && pdfUploadProgress) {
      setPdfUploadProgress(null);
    }
  }, [displayedStep, pdfUploadProgress, showModal]);

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
      .filter((candidate) => isRecommendedCandidate(candidate))
      .map((candidate) => candidate.url);
  // Search by type (primary search method)
  const handleTypeSearch = async (allowSnippetMatch = false) => {
    if (!webDraft.selectedContentType) {
      setError("タイプを選択してください");
      return;
    }
    if (!acquireLock("企業情報ページを検索中")) return;

    const selectedContentType = webDraft.selectedContentType;
    setIsSearching(true);
    setError(null);
    setWebDraft((prev) => ({
      ...prev,
      hasSearched: true,
      isRelaxedSearch: allowSnippetMatch,
      lastWebSearchKind: "type",
      lastContentType: selectedContentType,
    }));

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
        throw await parseApiErrorResponse(
          response,
          {
            code: "CORPORATE_PAGE_SEARCH_FAILED",
            userMessage: "企業情報ページを検索できませんでした。",
            action: "条件を見直して、もう一度お試しください。",
            retryable: true,
          },
          "CorporateInfoSection.handleTypeSearch"
        );
      }

      const data = await response.json();
      const nextCandidates = data.candidates || [];
      setWebDraft((prev) => ({
        ...prev,
        candidates: nextCandidates,
        selectedUrls: buildDefaultSelections(nextCandidates),
        hasSearched: true,
        isRelaxedSearch: allowSnippetMatch,
        lastWebSearchKind: "type",
        lastContentType: selectedContentType,
        step: "review",
      }));
      setModalStep("review");
    } catch (err) {
      const uiError = toAppUiError(
        err,
        {
          code: "CORPORATE_PAGE_SEARCH_FAILED",
          userMessage: "企業情報ページを検索できませんでした。",
          action: "条件を見直して、もう一度お試しください。",
          retryable: true,
        },
        "CorporateInfoSection.handleTypeSearch"
      );
      setError(uiError.message);
    } finally {
      setIsSearching(false);
      releaseLock();
    }
  };

  // Custom search (optional advanced feature)
  const handleCustomSearch = async (allowSnippetMatch = false) => {
    if (!webDraft.searchQuery.trim()) {
      setError("検索キーワードを入力してください");
      return;
    }
    if (!acquireLock("企業情報ページを検索中")) return;

    const rawSearchQuery = webDraft.searchQuery;
    const selectedContentType = webDraft.selectedContentType;
    setIsSearching(true);
    setError(null);
    const query = buildSearchQuery(rawSearchQuery);
    const resolvedContentType = selectedContentType ?? detectContentType(query);
    setWebDraft((prev) => ({
      ...prev,
      selectedContentType: prev.selectedContentType ?? resolvedContentType,
      lastContentType: resolvedContentType,
      hasSearched: true,
      isRelaxedSearch: allowSnippetMatch,
      lastWebSearchKind: "custom",
    }));

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
        throw await parseApiErrorResponse(
          response,
          {
            code: "CORPORATE_PAGE_SEARCH_FAILED",
            userMessage: "企業情報ページを検索できませんでした。",
            action: "条件を見直して、もう一度お試しください。",
            retryable: true,
          },
          "CorporateInfoSection.handleCustomSearch"
        );
      }

      const data = await response.json();
      const nextCandidates = data.candidates || [];
      setWebDraft((prev) => ({
        ...prev,
        selectedContentType: prev.selectedContentType ?? resolvedContentType,
        lastContentType: resolvedContentType,
        candidates: nextCandidates,
        selectedUrls: buildDefaultSelections(nextCandidates),
        hasSearched: true,
        isRelaxedSearch: allowSnippetMatch,
        lastWebSearchKind: "custom",
        step: "review",
      }));
      setModalStep("review");
    } catch (err) {
      const uiError = toAppUiError(
        err,
        {
          code: "CORPORATE_PAGE_SEARCH_FAILED",
          userMessage: "企業情報ページを検索できませんでした。",
          action: "条件を見直して、もう一度お試しください。",
          retryable: true,
        },
        "CorporateInfoSection.handleCustomSearch"
      );
      setError(uiError.message);
    } finally {
      setIsSearching(false);
      releaseLock();
    }
  };

  const handleFetchCorporateInfo = async () => {
    let urlsToFetch = [...webDraft.selectedUrls];

    if (inputMode === "url") {
      if (parsedCustomUrls.invalidLines.length > 0) {
        setError("URLの形式が正しくない行があります。http:// または https:// で始まるURLを1行ずつ入力してください。");
        return;
      }
      urlsToFetch = parsedCustomUrls.urls;
    }

    if (urlsToFetch.length === 0) {
      setError(inputMode === "url" ? "URLを入力してください" : "URLを選択してください");
      return;
    }

    if (inputMode === "url") {
      try {
        const complianceResponse = await fetch(`/api/companies/${companyId}/source-compliance/check`, {
          method: "POST",
          headers: buildHeaders(),
          credentials: "include",
          body: JSON.stringify({ urls: urlsToFetch }),
        });
        if (complianceResponse.ok) {
          const complianceData: ComplianceCheckResponse = await complianceResponse.json();
          if (complianceData.blockedResults.length > 0) {
            setError(complianceData.blockedResults[0]?.reasons[0] || "公開ページURLのみ取得できます");
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
        // Fall through to server-side validation.
      }
    }
    if (!acquireLock("企業情報ページを取得中")) return;

    setIsFetching(true);
    setError(null);
    setFetchResult(null);

    try {
      const contentChannel = resolveContentChannel(resolvedWebContentType);
      const contentType = resolvedWebContentType;
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
        const uiError = await parseApiErrorResponse(
          response,
          {
            code: "CORPORATE_FETCH_LIMIT_REACHED",
            userMessage: "この操作は現在利用できませんでした。",
            action: "プランや残高を確認して、もう一度お試しください。",
          },
          "CorporateInfoSection.handleFetchCorporateInfo"
        );
        setError(uiError.message);
        return;
      }

      if (!response.ok) {
        throw await parseApiErrorResponse(
          response,
          {
            code: "CORPORATE_FETCH_FAILED",
            userMessage: "企業情報を取得できませんでした。",
            action: "URLや設定を確認して、もう一度お試しください。",
            retryable: true,
          },
          "CorporateInfoSection.handleFetchCorporateInfo"
        );
      }

      const result = await response.json();

      await fetchStatus();
      const chunks = result.chunksStored ?? 0;
      if (shouldCloseCorporateFetchModalOnSuccess(result)) {
        closeModal();
        const costNote =
          typeof result.estimatedCostBand === "string" && result.estimatedCostBand.trim()
            ? ` ${result.estimatedCostBand}。`
            : "";
        window.setTimeout(() => {
          notifySuccess({
            title: "企業RAGへの取り込みが完了しました",
            description: `${chunks.toLocaleString()} チャンクを保存しました。ES添削・志望動機・企業内検索で参照できます。${costNote}`.trim(),
            duration: 4800,
          });
        }, RAG_SUCCESS_SNACKBAR_DELAY_MS);
      } else if (result.success && chunks === 0 && (result.pagesCrawled ?? 0) > 0) {
        closeModal();
        window.setTimeout(() => {
          notifyMessage(
            "ページの取得は完了しましたが、保存されたチャンクがありません。別のURLを試してください。",
            5200
          );
        }, RAG_SUCCESS_SNACKBAR_DELAY_MS);
      } else {
        setFetchResult(result);
        setModalStep("result");
      }
    } catch (err) {
      const uiError = toAppUiError(
        err,
        {
          code: "CORPORATE_FETCH_FAILED",
          userMessage: "企業情報を取得できませんでした。",
          action: "URLや設定を確認して、もう一度お試しください。",
          retryable: true,
        },
        "CorporateInfoSection.handleFetchCorporateInfo"
      );
      setError(uiError.message);
    } finally {
      setIsFetching(false);
      releaseLock();
    }
  };

  const handleUploadPdf = async () => {
    if (pdfDraft.uploadFiles.length === 0) {
      setError("PDFファイルを選択してください");
      return;
    }
    if (!acquireLock("企業情報PDFを取り込み中")) return;

    setIsUploading(true);
    setError(null);
    setFetchResult(null);
    setModalStep("configure");
    setDisplayedStep("configure");
    setIsStepTransitioning(false);
    setPdfUploadProgress(
      pdfDraft.uploadFiles.map((file) => ({
        file,
        status: "waiting",
      }))
    );

    try {
      const allItems: BatchUploadItem[] = [];
      let totalChunks = 0;
      let totalUnits = 0;
      let totalCreditsConsumed = 0;
      let totalCreditsDeducted = 0;
      let latestRemainingFreeUnits: number | undefined;
      let latestEstimatedCostBand: string | undefined;

      for (const [index, file] of pdfDraft.uploadFiles.entries()) {
        setPdfUploadProgress((prev) =>
          prev?.map((progress, progressIndex) =>
            progressIndex === index ? { ...progress, status: "uploading", error: undefined } : progress
          ) ?? null
        );

        try {
          const formData = new FormData();
          formData.append("file", file);
          const contentType =
            pdfDraft.uploadFileContentTypes[pdfFileKey(file)] || DEFAULT_PDF_UPLOAD_CONTENT_TYPE;
          formData.append("contentType", contentType);

          const response = await fetch(`/api/companies/${companyId}/fetch-corporate-upload`, {
            method: "POST",
            credentials: "include",
            body: formData,
          });

          if (!response.ok) {
            throw await parseApiErrorResponse(
              response,
              {
                code: "CORPORATE_UPLOAD_FAILED",
                userMessage: "PDFを取り込めませんでした。",
                action: "ファイルや設定を確認して、もう一度お試しください。",
                retryable: true,
              },
              "CorporateInfoSection.handleUploadPdf"
            );
          }

          const result = await response.json();
          const item: BatchUploadItem = result.items?.[0] || {
            fileName: file.name,
            status: "failed",
            error: "取り込み結果を確認できませんでした。",
          };

          allItems.push(item);
          totalChunks += item.chunksStored || 0;
          totalUnits += item.ingestUnits || 0;
          totalCreditsConsumed += item.creditsConsumed || 0;
          totalCreditsDeducted += item.actualCreditsDeducted || 0;
          latestRemainingFreeUnits =
            typeof result.remainingFreeUnits === "number" ? result.remainingFreeUnits : latestRemainingFreeUnits;
          latestEstimatedCostBand =
            typeof result.estimatedCostBand === "string" ? result.estimatedCostBand : latestEstimatedCostBand;

          setPdfUploadProgress((prev) =>
            prev?.map((progress, progressIndex) =>
              progressIndex === index
                ? {
                    ...progress,
                    status: item.status === "completed" ? "completed" : "failed",
                    error: item.error,
                    result: item,
                  }
                : progress
            ) ?? null
          );
        } catch (err) {
          const uiError = toAppUiError(
            err,
            {
              code: "CORPORATE_UPLOAD_FAILED",
              userMessage: "PDFを取り込めませんでした。",
              action: "ファイルや設定を確認して、もう一度お試しください。",
              retryable: true,
            },
            "CorporateInfoSection.handleUploadPdf"
          );
          const failedItem: BatchUploadItem = {
            fileName: file.name,
            status: "failed",
            error: uiError.message,
          };

          allItems.push(failedItem);
          setPdfUploadProgress((prev) =>
            prev?.map((progress, progressIndex) =>
              progressIndex === index
                ? {
                    ...progress,
                    status: "failed",
                    error: uiError.message,
                    result: failedItem,
                  }
                : progress
            ) ?? null
          );
        }
      }

      const completedCount = allItems.filter((item) => item.status === "completed").length;
      const failedCount = allItems.filter((item) => item.status === "failed").length;
      const skippedLimitCount = allItems.filter((item) => item.status === "skipped_limit").length;
      const totalFreeUnitsApplied = allItems
        .filter((item) => item.status === "completed")
        .reduce((sum, item) => sum + (item.freeUnitsApplied ?? 0), 0);
      await fetchStatus();
      const nextFetchResult: FetchResult = {
        success: completedCount > 0,
        pagesCrawled: pdfDraft.uploadFiles.length,
        chunksStored: totalChunks,
        totalUnits,
        freeUnitsApplied: totalFreeUnitsApplied,
        remainingFreeUnits: latestRemainingFreeUnits,
        creditsConsumed: totalCreditsConsumed,
        actualCreditsDeducted: totalCreditsDeducted,
        estimatedCostBand: latestEstimatedCostBand,
        errors: allItems
          .filter((item) => typeof item.error === "string")
          .map((item) => item.error as string),
        sourceLabel: "PDF",
        summary: {
          total: pdfDraft.uploadFiles.length,
          completed: completedCount,
          pending: 0,
          failed: failedCount,
          skippedLimit: skippedLimitCount,
        },
        items: allItems,
      };

      if (shouldCloseCorporateFetchModalOnSuccess(nextFetchResult)) {
        closeModal();
      } else {
        setFetchResult(nextFetchResult);
        setModalStep("result");
      }

      if (completedCount > 0 && totalChunks > 0) {
        const costNote =
          typeof latestEstimatedCostBand === "string" && latestEstimatedCostBand.trim()
            ? ` ${latestEstimatedCostBand}。`
            : "";
        const failNote =
          failedCount > 0 || skippedLimitCount > 0
            ? ` 一部ファイルは取り込めませんでした（失敗 ${failedCount} / 上限スキップ ${skippedLimitCount}）。`
            : "";
        window.setTimeout(() => {
          notifySuccess({
            title: "企業RAGへの取り込みが完了しました",
            description: `PDF ${completedCount} 件、計 ${totalChunks.toLocaleString()} チャンクを保存しました。ES添削・志望動機・企業内検索で参照できます。${costNote}${failNote}`.trim(),
            duration: 5200,
          });
        }, RAG_SUCCESS_SNACKBAR_DELAY_MS);
      } else if (completedCount > 0 && totalChunks === 0) {
        window.setTimeout(() => {
          notifyMessage("PDFの取り込みは完了しましたが、保存されたチャンクがありません。", 4800);
        }, RAG_SUCCESS_SNACKBAR_DELAY_MS);
      }
    } catch (err) {
      const uiError = toAppUiError(
        err,
        {
          code: "CORPORATE_UPLOAD_FAILED",
          userMessage: "PDFを取り込めませんでした。",
          action: "ファイルや設定を確認して、もう一度お試しください。",
          retryable: true,
        },
        "CorporateInfoSection.handleUploadPdf"
      );
      setError(uiError.message);
    } finally {
      setIsUploading(false);
      releaseLock();
    }
  };

  const handleModeSwitch = (mode: InputMode) => {
    if (mode === inputMode) {
      return;
    }

    if (inputMode === "web" && activeModalStep !== "result") {
      setWebDraft((prev) => ({
        ...prev,
        step: activeModalStep === "review" ? "review" : "configure",
      }));
    }

    setInputMode(mode);
    setError(null);
    setModalStep(mode === "web" ? webDraft.step : "configure");
  };

  const openModal = () => {
    setShowModal(true);
    setModalStep("configure");
    setDisplayedStep("configure");
    setIsStepTransitioning(false);
    setWebDraft(createInitialWebDraft());
    setUrlDraft(createInitialUrlDraft());
    setPdfDraft(createInitialPdfDraft());
    setPdfUploadProgress(null);
    setFetchResult(null);
    setError(null);
    setInputMode("web");
  };

  const closeModal = () => {
    setShowModal(false);
    setModalStep("configure");
    setDisplayedStep("configure");
    setIsStepTransitioning(false);
    setPdfUploadProgress(null);
    setFetchResult(null);
    setError(null);
  };

  const toggleUrl = (url: string) => {
    setWebDraft((prev) => ({
      ...prev,
      selectedUrls: prev.selectedUrls.includes(url)
        ? prev.selectedUrls.filter((selectedUrl) => selectedUrl !== url)
        : [...prev.selectedUrls, url],
    }));
  };

  const renderCandidateItem = (candidate: SearchCandidate) => {
    const sourceType = candidate.sourceType || "other";
    const confidence = normalizeSourceConfidence(
      sourceType,
      candidate.confidence
    );
    const sourceMeta = SOURCE_TYPE_META[sourceType];
    const confidenceMeta = CONFIDENCE_META[confidence];
    const isSelected = webDraft.selectedUrls.includes(candidate.url);
    const compactUrl = formatCandidateUrl(candidate.url, 88);

    return (
      <div
        key={candidate.url}
        className={cn(
          "flex items-start gap-2.5 px-3 py-2 transition-colors",
          isSelected ? "bg-primary/5" : "bg-background"
        )}
      >
        <input
          type="checkbox"
          checked={isSelected}
          onChange={() => toggleUrl(candidate.url)}
          className="mt-1 h-4 w-4 shrink-0 rounded border-border accent-primary"
          disabled={isFetching || isUploading}
          aria-label={`${candidate.title || compactUrl} を取得対象に追加`}
        />

        <div className="min-w-0 flex-1">
          <a
            href={candidate.url}
            target="_blank"
            rel="noopener noreferrer"
            className="block truncate text-[13px] font-medium text-foreground transition-colors hover:text-primary hover:underline"
            title={candidate.title || compactUrl}
          >
            {candidate.title || compactUrl}
          </a>
          <a
            href={candidate.url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-0.5 block truncate text-[11px] text-muted-foreground transition-colors hover:text-primary hover:underline"
            title={candidate.url}
          >
            {compactUrl}
          </a>
          <div className="mt-1.5 flex flex-wrap gap-1">
            <span
              className={cn(
                "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium",
                sourceMeta.className
              )}
            >
              {sourceMeta.label}
            </span>
            <span
              className={cn(
                "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium",
                confidenceMeta.className
              )}
            >
              信頼度 {confidenceMeta.label}
            </span>
          </div>
          {candidate.complianceStatus === "blocked" && candidate.complianceReasons?.[0] && (
            <p className="mt-1.5 text-[11px] text-destructive">{candidate.complianceReasons[0]}</p>
          )}
          {candidate.complianceStatus === "warning" && candidate.complianceReasons?.[0] && (
            <p className="mt-1.5 text-[11px] text-amber-700">{candidate.complianceReasons[0]}</p>
          )}
        </div>
      </div>
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
    if (!acquireLock("RAGデータを削除中")) return;

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
        throw await parseApiErrorResponse(
          response,
          {
            code: "CORPORATE_URL_DELETE_FAILED",
            userMessage: "企業情報を削除できませんでした。",
            action: "時間を置いて、もう一度お試しください。",
            retryable: true,
          },
          "CorporateInfoSection.handleDeleteUrls"
        );
      }

      // Refresh status
      await fetchStatus();
      onUpdate?.();

      // Reset state
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
        "CorporateInfoSection.handleDeleteUrls"
      );
      setDeleteError(uiError.message);
    } finally {
      setIsDeleting(false);
      releaseLock();
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
        <CardHeader className="py-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <BuildingIcon />
            企業情報データベース
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <LoadingSpinner />
          </div>
        </CardContent>
      </Card>
    );
  }

  const ragStatus = status?.ragStatus;
  // Show stats if there are any URLs registered
  const hasAnyData = status?.corporateInfoUrls && status.corporateInfoUrls.length > 0;
  const totalSources = status?.corporateInfoUrls?.length || 0;
  const pageLimit = status?.pageLimit || 0;
  const sourceUsagePercent = Math.min((totalSources / Math.max(pageLimit, 1)) * 100, 100);
  const shouldShowRagAllowance = isAuthenticated && plan !== "guest";
  const ragUnitUsagePercent =
    shouldShowRagAllowance && companyRagUnitsLimit > 0
      ? Math.min(
          ((companyRagUnitsLimit - Math.max(companyRagUnitsRemaining, 0)) / Math.max(companyRagUnitsLimit, 1)) * 100,
          100,
        )
      : 0;
  const lastUpdatedLabel = formatTimestamp(ragStatus?.lastUpdated, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  const pdfUploadInputId = `pdf-upload-input-${companyId}`;

  return (
    <>
      <Card className="border-border/50">
        <CardHeader className="flex flex-row items-center justify-between py-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <BuildingIcon />
            企業情報データベース
          </CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={openModal}
            disabled={isLocked}
          >
            <SparklesIcon />
            企業情報を取得
          </Button>
        </CardHeader>
        <CardContent className="space-y-4 pt-0">
          <p className="text-sm text-muted-foreground">
            ES添削や志望動機づくりに使う企業ソースを整理します。
          </p>
          {shouldShowRagAllowance ? (
            <div className="rounded-xl border border-border/60 bg-muted/20 px-4 py-3">
              <div className="flex flex-col gap-2 text-sm text-foreground sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-medium">今月の企業RAG無料枠</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {`残り ${companyRagUnitsRemaining.toLocaleString("ja-JP")} / ${companyRagUnitsLimit.toLocaleString("ja-JP")} ページ（月次・URL＋PDF合算）`}
                  </p>
                </div>
                <span className="rounded-full border border-border/60 bg-background px-2.5 py-1 text-xs text-muted-foreground">
                  1社あたり上限 {pageLimit} ソース
                </span>
              </div>
              <div className="mt-3 h-2 rounded-full bg-muted">
                <div
                  className="h-2 rounded-full bg-primary transition-all"
                  style={{ width: `${ragUnitUsagePercent}%` }}
                />
              </div>
            </div>
          ) : null}
          {!hasAnyData ? (
            <div className="rounded-xl border border-dashed border-border/70 bg-muted/20 px-5 py-10 text-center">
              <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-muted/50 text-muted-foreground">
                <BuildingIcon />
              </div>
              <p className="text-sm font-medium text-foreground">
                まだ企業情報が登録されていません
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                企業情報ページを取得して、ES添削の精度を高めるためのソースを準備しましょう。
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className={cn(SURFACE_CLASS, "p-4")}>
                  <p className="text-xs font-medium text-muted-foreground">登録済みソース</p>
                  <p className="mt-2 text-2xl font-semibold tracking-tight">{totalSources}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Web・URL・PDF をまとめて管理
                  </p>
                </div>
                <div className={cn(SURFACE_CLASS, "p-4")}>
                  <p className="text-xs font-medium text-muted-foreground">保存チャンク</p>
                  <p className="mt-2 text-2xl font-semibold tracking-tight">
                    {ragStatus?.totalChunks?.toLocaleString("ja-JP") || 0}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    ES添削で参照できるテキスト量
                  </p>
                </div>
                <div className={cn(SURFACE_CLASS, "p-4")}>
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-medium text-muted-foreground">利用状況</p>
                      <p className="mt-2 text-2xl font-semibold tracking-tight">
                        {pageLimit > 0 ? `${Math.round(sourceUsagePercent)}%` : "0%"}
                      </p>
                    </div>
                    <span className="rounded-full border border-border/60 bg-muted/20 px-2.5 py-1 text-xs text-muted-foreground">
                      {totalSources} / {pageLimit || 0}
                    </span>
                  </div>
                  <div className="mt-3 h-2 rounded-full bg-muted">
                    <div
                      className="h-2 rounded-full bg-primary transition-all"
                      style={{ width: `${sourceUsagePercent}%` }}
                    />
                  </div>
                </div>
              </div>

              {STATS_GROUPS.map((group) => (
                <div key={group.groupName} className={cn(SURFACE_CLASS, "p-4")}>
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium text-foreground">{group.groupName}</p>
                    <span className="text-xs text-muted-foreground">
                      {group.items.reduce(
                        (sum, item) => sum + (urlCountsByType[item.key] || 0),
                        0
                      )}件
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {group.items.map((config) => {
                      const count = urlCountsByType[config.key] || 0;
                      const hasData = count > 0;
                      return (
                        <div
                          key={config.key}
                          className={cn(
                            "inline-flex items-center gap-2 rounded-xl border px-3 py-2 transition-colors",
                            hasData
                              ? `${config.colorClass} shadow-xs`
                              : "border-border/60 bg-muted/20 text-muted-foreground"
                          )}
                          title={config.label}
                        >
                          <span className="text-xs font-medium">{config.shortLabel}</span>
                          <span className="text-sm font-semibold leading-none">{count}</span>
                          {hasData && (
                            <svg
                              className="h-3 w-3 text-emerald-600"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={3}
                                d="M5 13l4 4L19 7"
                              />
                            </svg>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}

              {(sourceStatusCounts.pending > 0 || sourceStatusCounts.processing > 0) && (
                <div className="rounded-xl border border-amber-200/80 bg-amber-50/80 px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    {sourceStatusCounts.pending > 0 && (
                      <span className="inline-flex rounded-full border border-amber-200 bg-white/80 px-2.5 py-1 text-xs font-medium text-amber-700">
                        OCR保留 {sourceStatusCounts.pending}件
                      </span>
                    )}
                    {sourceStatusCounts.processing > 0 && (
                      <span className="inline-flex rounded-full border border-sky-200 bg-white/80 px-2.5 py-1 text-xs font-medium text-sky-700">
                        処理中 {sourceStatusCounts.processing}件
                      </span>
                    )}
                  </div>
                  <p className="mt-2 text-xs text-amber-900/80">
                    カテゴリ別の件数には、自動判定前のPDFはまだ含まれません。登録済みソース一覧には反映されています。
                  </p>
                </div>
              )}

              <div className="flex flex-col gap-3 border-t border-border/60 pt-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-muted-foreground">
                  {lastUpdatedLabel
                    ? `最新更新: ${lastUpdatedLabel}`
                    : "まだ更新履歴はありません"}
                </p>
                {totalSources > 0 && (
                  <Button variant="outline" size="sm" onClick={openUrlModal}>
                    登録済みソースを見る
                  </Button>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Corporate Info Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] pt-[max(0.625rem,env(safe-area-inset-top))] sm:p-3">
          <Card className="flex h-[min(700px,calc(100dvh-1.5rem))] min-h-0 w-full max-w-4xl flex-col overflow-hidden border-border/50">
            <div className="relative shrink-0 border-b px-4 py-2.5">
              <div className="pr-10">
                <h2 className="text-base font-semibold text-foreground">企業情報を取得</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {companyName} の企業研究ソースを追加します
                </p>
              </div>
              <div className="mt-2.5 grid grid-cols-3 gap-1">
                {(
                  [
                    { key: "configure", label: "1. 条件" },
                    { key: "review", label: "2. 候補" },
                    { key: "result", label: "3. 完了" },
                  ] as Array<{ key: ModalStep; label: string }>
                ).map((step) => {
                  const isActive = activeModalStep === step.key;
                  const isComplete =
                    (step.key === "configure" && activeModalStep !== "configure") ||
                    (step.key === "review" && activeModalStep === "result");
                  const isNavigable = isStepNavigable(step.key);
                  return (
                    <button
                      type="button"
                      key={step.key}
                      onClick={() => handleStepNavigation(step.key)}
                      disabled={!isNavigable}
                      aria-current={isActive ? "step" : undefined}
                      className={cn(
                        "rounded-lg border px-2.5 py-1.5 text-left text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30",
                        isActive
                          ? "border-primary/30 bg-primary/5 text-primary"
                          : isComplete
                            ? "border-emerald-200/80 bg-emerald-50 text-emerald-700"
                            : "border-border/60 bg-muted/15 text-muted-foreground",
                        isNavigable
                          ? "cursor-pointer hover:border-primary/20 hover:bg-primary/5 hover:text-foreground"
                          : "cursor-not-allowed opacity-70"
                      )}
                    >
                      {step.label}
                    </button>
                  );
                })}
              </div>
              <button
                type="button"
                onClick={closeModal}
                className="absolute right-3 top-2.5 rounded-full p-1.5 transition-colors hover:bg-background/70"
                disabled={isModalBusy}
              >
                <XIcon />
              </button>
            </div>

            <div
              className={cn(
                "flex-1 min-h-0 overflow-hidden transition-opacity duration-200",
                isStepTransitioning ? "opacity-0" : "opacity-100"
              )}
            >
              {displayedStep === "result" && fetchResult && (
                <div className="h-full overflow-y-auto px-4 py-3">
                  <div
                    className={cn(
                      `${SURFACE_CLASS} p-4`,
                      fetchResult.success
                        ? "border-emerald-200 bg-emerald-50/90"
                        : "border-amber-200 bg-amber-50/90"
                    )}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <div
                          className={cn(
                            "flex h-10 w-10 items-center justify-center rounded-2xl border",
                            fetchResult.success
                              ? "border-emerald-200 bg-emerald-100 text-emerald-600"
                              : "border-amber-200 bg-amber-100 text-amber-600"
                          )}
                        >
                          {fetchResult.success ? <CheckIcon /> : <XIcon />}
                        </div>
                        <div>
                          <p
                            className={cn(
                              "text-sm font-semibold",
                              fetchResult.success ? "text-emerald-800" : "text-amber-800"
                            )}
                          >
                            {fetchResult.success ? "取得が完了しました" : "一部の取得に失敗しました"}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            取り込み結果を確認して、必要なら追加のソースを登録してください。
                          </p>
                        </div>
                      </div>
                      <span
                        className={cn(
                          "rounded-full border px-2.5 py-1 text-[11px] font-medium",
                          fetchResult.success
                            ? "border-emerald-200/80 bg-emerald-100/80 text-emerald-700"
                            : "border-amber-200/80 bg-amber-100/80 text-amber-700"
                        )}
                      >
                        {fetchResult.success ? "登録完了" : "要確認"}
                      </span>
                    </div>

                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      {[
                        fetchResult.sourceLabel
                          ? { label: "取得元", value: fetchResult.sourceLabel }
                          : null,
                        { label: "取得ページ数", value: String(fetchResult.pagesCrawled) },
                        { label: "保存チャンク数", value: fetchResult.chunksStored.toLocaleString("ja-JP") },
                        fetchResult.summary
                          ? {
                              label: "同期完了",
                              value: `${fetchResult.summary.completed.toLocaleString("ja-JP")}件`,
                            }
                          : null,
                        fetchResult.summary && fetchResult.summary.pending > 0
                          ? {
                              label: "OCR保留",
                              value: `${fetchResult.summary.pending.toLocaleString("ja-JP")}件`,
                            }
                          : null,
                        typeof fetchResult.actualUnits === "number"
                          ? {
                              label: "今回の取込ページ",
                              value: fetchResult.actualUnits.toLocaleString("ja-JP"),
                            }
                          : null,
                        typeof fetchResult.totalUnits === "number" && fetchResult.totalUnits > 0
                          ? {
                              label: "合計取込ページ",
                              value: fetchResult.totalUnits.toLocaleString("ja-JP"),
                            }
                          : null,
                        typeof fetchResult.freeUnitsApplied === "number"
                          ? {
                              label: "無料枠に充当",
                              value: `${fetchResult.freeUnitsApplied.toLocaleString("ja-JP")} ページ`,
                            }
                          : null,
                        typeof fetchResult.remainingFreeUnits === "number"
                          ? {
                              label: "無料枠の残り",
                              value: `${fetchResult.remainingFreeUnits.toLocaleString("ja-JP")} ページ`,
                            }
                          : null,
                        typeof fetchResult.creditsConsumed === "number"
                          ? {
                              label: "表示上の消費",
                              value: `${fetchResult.creditsConsumed.toLocaleString("ja-JP")} クレジット`,
                            }
                          : null,
                        typeof fetchResult.actualCreditsDeducted === "number"
                          ? {
                              label: "実際の消費",
                              value: `${fetchResult.actualCreditsDeducted.toLocaleString("ja-JP")} クレジット`,
                            }
                          : null,
                        fetchResult.estimatedCostBand
                          ? {
                              label: "今回の課金帯",
                              value: fetchResult.estimatedCostBand,
                            }
                          : null,
                        fetchResult.extractionMethod
                          ? {
                              label: "抽出方法",
                              value: getExtractionMethodLabel(fetchResult.extractionMethod),
                            }
                          : null,
                        typeof fetchResult.extractedChars === "number" && fetchResult.extractedChars > 0
                          ? {
                              label: "抽出文字数",
                              value: fetchResult.extractedChars.toLocaleString("ja-JP"),
                            }
                          : null,
                      ]
                        .filter((item): item is { label: string; value: string } => Boolean(item))
                        .map((item) => (
                          <div
                            key={item.label}
                            className="rounded-xl border border-white/70 bg-white/70 px-3 py-3"
                          >
                            <p className="text-[11px] font-medium text-muted-foreground">
                              {item.label}
                            </p>
                            <p className="mt-1 text-sm font-medium text-foreground">
                              {item.value}
                            </p>
                          </div>
                        ))}
                    </div>

                    {fetchResult.items && fetchResult.items.length > 0 && (
                      <div className="mt-4 rounded-xl border border-white/70 bg-white/70 px-4 py-3">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-medium text-foreground">各ファイルの取り込み結果</p>
                        </div>
                        <div className="mt-3 max-h-72 space-y-2 overflow-y-auto">
                          {fetchResult.items.map((item) => {
                            const statusMeta = getBatchItemStatusMeta(item.status);
                            return (
                              <div
                                key={`${item.fileName}-${item.sourceUrl || item.status}`}
                                className="rounded-lg border border-border/70 bg-background/80 px-3 py-3"
                              >
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <p className="truncate text-sm font-medium text-foreground">
                                      {item.fileName}
                                    </p>
                                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                      {typeof item.chunksStored === "number" && item.chunksStored > 0 && (
                                        <span>保存チャンク {item.chunksStored.toLocaleString("ja-JP")}</span>
                                      )}
                                      {typeof item.extractedChars === "number" && item.extractedChars > 0 && (
                                        <span>抽出文字数 {item.extractedChars.toLocaleString("ja-JP")}</span>
                                      )}
                                      {item.extractionMethod && (
                                        <span>{getExtractionMethodLabel(item.extractionMethod)}</span>
                                      )}
                                      {item.contentType && (
                                        <span>{CONTENT_TYPE_LABELS[item.contentType] || item.contentType}</span>
                                      )}
                                    </div>
                                    {item.error && (
                                      <p className="mt-2 text-xs text-destructive">{item.error}</p>
                                    )}
                                    {item.status === "completed" && item.processingNoticeJa ? (
                                      <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
                                        {item.processingNoticeJa}
                                      </p>
                                    ) : null}
                                  </div>
                                  <span
                                    className={cn(
                                      "inline-flex rounded-full border px-2.5 py-1 text-[11px] font-medium",
                                      statusMeta.className
                                    )}
                                  >
                                    {statusMeta.label}
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {fetchResult.errors.length > 0 && (
                      <div className="mt-4 rounded-xl border border-amber-200 bg-amber-100/70 px-4 py-3">
                        <p className="text-sm font-medium text-amber-800">エラー</p>
                        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-700">
                          {fetchResult.errors.map((err, i) => (
                            <li key={i}>{err}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    <div className="mt-4 flex justify-end">
                      <Button onClick={closeModal} size="sm">
                        閉じる
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {displayedStep !== "result" && (
                <div className="flex h-full min-h-0 flex-col px-3 py-2.5 sm:px-4">
                  <div className="shrink-0 space-y-1.5">
                    <div className="rounded-lg border border-border/50 bg-muted/15 p-0.5">
                      <div className="grid grid-cols-3 gap-0.5">
                        {(
                          [
                            { mode: "web", icon: <GlobeIcon />, label: "Web検索" },
                            { mode: "url", icon: <LinkIcon />, label: "URL指定" },
                            { mode: "pdf", icon: <FileUploadIcon />, label: "資料アップロード" },
                          ] as Array<{ mode: InputMode; icon: React.ReactNode; label: string }>
                        ).map(({ mode, icon, label }) => (
                          <button
                            key={mode}
                            onClick={() => handleModeSwitch(mode)}
                            disabled={isModalBusy}
                            className={cn(
                              "flex min-h-[32px] items-center justify-center gap-1 rounded-md border px-1.5 py-1 text-[11px] font-medium transition-colors",
                              inputMode === mode
                                ? "border-primary/20 bg-background text-primary"
                                : "border-transparent text-muted-foreground hover:bg-background/70"
                            )}
                          >
                            {icon}
                            <span className="truncate">{label}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {error && (
                      <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2">
                        <p className="text-xs text-destructive">{error}</p>
                      </div>
                    )}
                  </div>

                  <div
                    className={cn(
                      "mt-2 flex min-h-0 flex-1 flex-col",
                      !showWebReviewStep && "overflow-y-auto overscroll-contain pb-1"
                    )}
                  >
                    {showConfigureStep && inputMode === "web" && (
                      <div className="space-y-2">
                        <div className="rounded-lg border border-border/60 bg-background/80 p-3">
                          <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                              <p className="text-sm font-semibold text-foreground">タイプを選択して検索</p>
                              <p className="mt-0.5 text-xs text-muted-foreground">
                                まず候補を探し、必要ならキーワードで絞り込みます。
                              </p>
                            </div>
                            {webDraft.selectedContentType && (
                              <span className="inline-flex items-center rounded-full border border-border/70 bg-background px-2 py-0.5 text-[11px] font-medium text-foreground">
                                {CONTENT_TYPE_LABELS[webDraft.selectedContentType]}
                              </span>
                            )}
                          </div>
                          <div className="mt-2.5 flex flex-col gap-2 sm:flex-row">
                            <select
                              value={webDraft.selectedContentType || ""}
                              onChange={(e) => {
                                const value = e.target.value as ContentType | "";
                                setWebDraft((prev) => ({
                                  ...prev,
                                  selectedContentType: value || null,
                                }));
                              }}
                              disabled={isSearching || isFetching || isUploading}
                              className={cn(FIELD_CLASS, "h-9 flex-1")}
                            >
                              <option value="">タイプを選択してください</option>
                              {CONTENT_TYPE_OPTIONS.map((opt) => (
                                <option key={opt.value} value={opt.value}>
                                  {opt.label}
                                </option>
                              ))}
                            </select>
                            <Button
                              onClick={() => handleTypeSearch()}
                              disabled={!webDraft.selectedContentType || isSearching || isFetching || isUploading}
                              className="sm:min-w-[104px]"
                            >
                              {isSearching && webDraft.lastWebSearchKind === "type" ? <LoadingSpinner /> : "検索"}
                            </Button>
                          </div>
                        </div>

                        <div className="rounded-lg border border-border/60 bg-muted/10 p-3">
                          <p className="text-sm font-semibold text-foreground">詳細検索</p>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            欲しいページが決まっている場合だけキーワードを足します。
                          </p>
                          <div className="mt-2.5 flex flex-col gap-2 sm:flex-row">
                            <input
                              type="text"
                              value={webDraft.searchQuery}
                              onChange={(e) =>
                                setWebDraft((prev) => ({
                                  ...prev,
                                  searchQuery: e.target.value,
                                }))
                              }
                              placeholder={`例: ${companyName} 社員インタビュー`}
                              className={cn(FIELD_CLASS, "h-9 flex-1")}
                              disabled={isSearching || isFetching || isUploading}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" && webDraft.searchQuery.trim()) {
                                  handleCustomSearch();
                                }
                              }}
                            />
                            <Button
                              variant="outline"
                              onClick={() => handleCustomSearch()}
                              disabled={!webDraft.searchQuery.trim() || isSearching || isFetching || isUploading}
                              className="sm:min-w-[104px]"
                            >
                              {isSearching && webDraft.lastWebSearchKind === "custom" ? <LoadingSpinner /> : "検索"}
                            </Button>
                          </div>
                        </div>
                      </div>
                    )}

                    {showWebReviewStep && (
                      <div className="flex min-h-0 flex-1 flex-col gap-1.5">
                        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/60 bg-muted/15 px-2.5 py-2">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleStepNavigation("configure")}
                              disabled={isModalBusy}
                              className="inline-flex min-h-[28px] items-center gap-1 rounded-md border border-border/70 bg-background px-2 py-1 text-[11px] font-medium text-foreground transition-colors hover:bg-muted/20 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              <ArrowLeftIcon />
                              条件に戻る
                            </button>
                            {resolvedWebContentType && (
                              <span className="inline-flex items-center rounded-full border border-border/70 bg-background px-2 py-0.5 text-[11px] font-medium text-foreground">
                                {CONTENT_TYPE_LABELS[resolvedWebContentType]}
                              </span>
                            )}
                            <span className="text-[11px] text-muted-foreground">
                              候補 {orderedCandidates.length}件
                            </span>
                            <span className="text-[11px] text-muted-foreground">
                              選択 {webDraft.selectedUrls.length}件
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() =>
                                setWebDraft((prev) => ({
                                  ...prev,
                                  selectedUrls: allCandidateUrls,
                                }))
                              }
                              className="rounded-md border border-border/60 bg-background px-2 py-1 text-[11px] font-medium text-foreground transition-colors hover:bg-muted/20"
                              disabled={isFetching || isUploading || allCandidateUrls.length === 0}
                            >
                              すべて選択
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setWebDraft((prev) => ({
                                  ...prev,
                                  selectedUrls: [],
                                }))
                              }
                              className="rounded-md border border-border/60 bg-background px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted/20 hover:text-foreground"
                              disabled={webDraft.selectedUrls.length === 0 || isFetching || isUploading}
                            >
                              解除
                            </button>
                          </div>
                        </div>

                        <div className="min-h-0 flex-1 overflow-hidden rounded-lg border border-border/60 bg-background">
                          <div className="h-full overflow-y-auto">
                            {orderedCandidates.length > 0 ? (
                              <div className="divide-y divide-border/60">
                                {orderedCandidates.map((candidate) => renderCandidateItem(candidate))}
                              </div>
                            ) : (
                              webDraft.hasSearched &&
                              !isSearching && (
                                <div className="m-3 rounded-lg border border-border/60 bg-muted/15 px-4 py-8 text-center">
                                  <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl border border-border/70 bg-background text-muted-foreground shadow-sm">
                                    <GlobeIcon />
                                  </div>
                                  <p className="mt-4 text-sm font-medium text-foreground">
                                    該当するページが見つかりませんでした
                                  </p>
                                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                                    {webDraft.isRelaxedSearch
                                      ? "詳細検索またはURL指定で、対象ページを直接指定してください。"
                                      : webDraft.lastWebSearchKind === "custom"
                                        ? "キーワードを見直すか、URL指定で対象ページを直接指定してください。"
                                        : "条件を緩和するか、詳細検索・URL指定をお試しください。"}
                                  </p>
                                  {!webDraft.isRelaxedSearch &&
                                    webDraft.lastWebSearchKind === "type" &&
                                    webDraft.selectedContentType && (
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => handleTypeSearch(true)}
                                        disabled={isSearching || isFetching || isUploading}
                                        className="mt-4"
                                      >
                                        条件を緩和して再検索
                                      </Button>
                                    )}
                                </div>
                              )
                            )}
                          </div>
                        </div>
                      </div>
                    )}

                    {showConfigureStep && inputMode === "url" && (
                      <div className="space-y-2 rounded-lg border border-border/60 bg-background/80 p-3">
                        <div>
                          <p className="text-sm font-semibold text-foreground">URL</p>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            1行に1つずつ入力すると、複数ページをまとめて取得できます。
                          </p>
                        </div>

                        <textarea
                          value={urlDraft.customUrlInput}
                          onChange={(e) =>
                            setUrlDraft({
                              customUrlInput: e.target.value,
                            })
                          }
                          placeholder={"https://example.com/recruit\nhttps://example.com/company\nhttps://example.com/ir"}
                          className={cn(
                            "h-[124px] w-full rounded-lg border border-border bg-background px-3 py-3 text-sm leading-6 transition-colors",
                            "focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                          )}
                          disabled={isFetching || isUploading}
                          spellCheck={false}
                        />

                        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          <span className="rounded-full border border-border/60 bg-muted/20 px-2.5 py-1">
                            有効なURL {parsedCustomUrls.urls.length}件
                          </span>
                          {parsedCustomUrls.invalidLines.length > 0 && (
                            <span className="rounded-full border border-destructive/20 bg-destructive/5 px-2.5 py-1 text-destructive">
                              無効な行 {parsedCustomUrls.invalidLines.length}件
                            </span>
                          )}
                          {parsedCustomUrls.totalLines > parsedCustomUrls.urls.length &&
                            parsedCustomUrls.invalidLines.length === 0 && (
                              <span className="inline-flex items-center rounded-full border border-border/70 bg-background px-2.5 py-1 text-xs font-medium text-foreground">
                                重複は自動でまとめます
                              </span>
                            )}
                        </div>

                        <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-xs leading-5 text-muted-foreground">
                          `http://` または `https://` から始まるURLを入力してください。
                        </div>
                      </div>
                    )}

                    {showConfigureStep && inputMode === "pdf" && (
                      <div className="rounded-lg border border-border/60 bg-background/80 p-3">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold text-foreground">資料アップロード</p>
                            <p className="mt-0.5 text-xs text-muted-foreground">
                              PDFを複数選択して企業情報として取り込みます。分類は本文から自動判定します。
                            </p>
                          </div>
                          <span className="inline-flex whitespace-nowrap rounded-full border border-border/60 bg-muted/20 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                            最大10件
                          </span>
                        </div>
                        <div className="mt-2 rounded-lg border border-border/70 bg-muted/20 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
                          <p className="font-medium text-foreground">取り込み前の上限</p>
                          <p className="mt-1">{ragPdfPolicySummaryJa}</p>
                        </div>
                        <div
                          className={cn(
                            "mt-2.5 flex flex-col items-center overflow-hidden rounded-lg border-2 border-dashed transition-colors",
                            pdfUploadProgress
                              ? "border-primary/30 bg-primary/5 px-3 py-3"
                              : pdfDraft.uploadFiles.length > 0
                                ? "cursor-pointer border-primary/40 bg-primary/5 px-3 py-3"
                                : "min-h-[140px] cursor-pointer justify-center border-border/80 bg-muted/10 p-5 hover:border-primary/30 hover:bg-primary/5"
                          )}
                          onDragOver={(e) => {
                            if (pdfUploadProgress || isUploading) return;
                            e.preventDefault();
                            e.stopPropagation();
                          }}
                          onDrop={(e) => {
                            if (pdfUploadProgress || isUploading) return;
                            e.preventDefault();
                            e.stopPropagation();
                            setPdfDraft((prev) => mergePdfDraftFiles(prev, e.dataTransfer.files));
                          }}
                          onClick={() => {
                            if (pdfUploadProgress || isUploading) return;
                            document.getElementById(pdfUploadInputId)?.click();
                          }}
                        >
                          <input
                            id={pdfUploadInputId}
                            type="file"
                            accept="application/pdf,.pdf"
                            multiple
                            onChange={(e) =>
                              setPdfDraft((prev) => mergePdfDraftFiles(prev, e.target.files))
                            }
                            disabled={isUploading || isFetching || isSearching}
                            className="hidden"
                          />
                          {pdfUploadProgress ? (
                            <div className="w-full space-y-3">
                              <div>
                                <p className="text-sm font-semibold text-foreground">PDF取り込み中</p>
                                <p className="mt-0.5 text-xs text-muted-foreground">
                                  {
                                    pdfUploadProgress.filter(
                                      (item) =>
                                        item.status === "completed" || item.status === "failed"
                                    ).length
                                  }
                                  /{pdfUploadProgress.length} ファイル完了
                                </p>
                              </div>
                              <div className="h-2 rounded-full bg-muted">
                                <div
                                  className="h-2 rounded-full bg-primary transition-all duration-300"
                                  style={{
                                    width: `${
                                      (pdfUploadProgress.filter(
                                        (item) =>
                                          item.status === "completed" || item.status === "failed"
                                      ).length /
                                        Math.max(pdfUploadProgress.length, 1)) *
                                      100
                                    }%`,
                                  }}
                                />
                              </div>
                              <div className="max-h-60 space-y-1.5 overflow-y-auto overflow-x-hidden">
                                {pdfUploadProgress.map((progress) => {
                                  const meta = getPdfFileStatusMeta(progress.status);
                                  return (
                                    <div
                                      key={`${progress.file.name}-${progress.file.size}-${progress.file.lastModified}`}
                                      className="flex items-center gap-2 rounded-md border border-border/70 bg-background/80 px-2.5 py-2"
                                    >
                                      <div
                                        className={cn(
                                          "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border",
                                          progress.status === "completed"
                                            ? "border-emerald-200 bg-emerald-50 text-emerald-600"
                                            : progress.status === "failed"
                                              ? "border-destructive/20 bg-destructive/5 text-destructive"
                                              : progress.status === "uploading"
                                                ? "border-primary/20 bg-primary/5 text-primary"
                                                : "border-border/70 bg-muted/30 text-muted-foreground"
                                        )}
                                      >
                                        {progress.status === "uploading" ? (
                                          <LoadingSpinner className="h-3.5 w-3.5" />
                                        ) : progress.status === "completed" ? (
                                          <CheckIcon />
                                        ) : progress.status === "failed" ? (
                                          <XIcon />
                                        ) : (
                                          <span className="h-2 w-2 rounded-full bg-current" />
                                        )}
                                      </div>
                                      <div className="min-w-0 flex-1">
                                        <p className="truncate text-xs font-medium text-foreground">
                                          {progress.file.name}
                                        </p>
                                        <p className={cn("text-[10px]", meta.className)}>
                                          {progress.status === "failed" && progress.error
                                            ? progress.error
                                            : meta.label}
                                        </p>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          ) : pdfDraft.uploadFiles.length > 0 ? (
                            <div className="w-full space-y-2">
                              <p className="text-center text-sm font-medium text-foreground">
                                {pdfDraft.uploadFiles.length}件のPDFを選択中
                              </p>
                              <div className="max-h-48 space-y-1.5 overflow-y-auto overflow-x-hidden">
                                {pdfDraft.uploadFiles.map((file) => (
                                  <div
                                    key={`${file.name}-${file.size}-${file.lastModified}`}
                                    className="flex flex-col gap-2 overflow-hidden rounded-md border border-border/70 bg-background/80 px-2.5 py-2 sm:flex-row sm:items-center"
                                  >
                                    <div className="min-w-0 flex-1">
                                      <p className="truncate text-xs font-medium text-foreground">
                                        {file.name}
                                      </p>
                                      <p className="text-[10px] text-muted-foreground">
                                        {(file.size / 1024 / 1024).toFixed(2)} MB
                                      </p>
                                    </div>
                                    <div className="flex items-center gap-2 sm:shrink-0">
                                      <label className="flex min-w-0 items-center gap-2 text-[11px] text-muted-foreground">
                                        <span className="shrink-0">資料タイプ</span>
                                        <div className="flex flex-col">
                                          <select
                                            value={
                                              pdfDraft.uploadFileContentTypes[pdfFileKey(file)] ||
                                              DEFAULT_PDF_UPLOAD_CONTENT_TYPE
                                            }
                                          onChange={(e) => {
                                            const nextType = e.target.value as PdfUploadContentType;
                                            setPdfDraft((prev) => ({
                                              ...prev,
                                              uploadFileContentTypes: {
                                                ...prev.uploadFileContentTypes,
                                                [pdfFileKey(file)]: nextType,
                                              },
                                            }));
                                          }}
                                            onClick={(e) => e.stopPropagation()}
                                            className="h-9 min-w-0 rounded-md border border-border bg-background px-2.5 text-xs text-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
                                          >
                                            {PDF_UPLOAD_CONTENT_TYPE_OPTIONS.map((option) => (
                                              <option key={option.value} value={option.value}>
                                                {option.label}
                                              </option>
                                            ))}
                                          </select>
                                          <p className="mt-1 text-[10px] text-muted-foreground">
                                            OCRルーティング:{" "}
                                            {getPdfUploadContentTypeLabel(
                                              pdfDraft.uploadFileContentTypes[pdfFileKey(file)] ||
                                                DEFAULT_PDF_UPLOAD_CONTENT_TYPE
                                            )}
                                          </p>
                                        </div>
                                      </label>
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setPdfDraft((prev) => removePdfDraftFile(prev, file));
                                        }}
                                        className="shrink-0 rounded-full p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                                      >
                                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                        </svg>
                                      </button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                              <p className="text-center text-[11px] text-muted-foreground">
                                OCRが必要なPDFがある場合、通常より時間がかかることがあります（1ファイルあたり5〜15秒）
                              </p>
                              {pdfCreditPreview ? (
                                <div className="max-h-44 overflow-y-auto overscroll-contain rounded-lg border border-border/60 bg-muted/15 px-3 py-2.5 text-left text-[11px] leading-relaxed text-muted-foreground sm:max-h-52">
                                  {pdfCreditPreview.kind === "loading" ? (
                                    <p>PDF のページ数を確認しています…</p>
                                  ) : pdfCreditPreview.kind === "partial" ? (
                                    <div className="space-y-2">
                                      <p className="font-medium text-foreground">ページ数が一部だけ分かりません</p>
                                      <p>
                                        取り込みが完了した時点で、実際に使ったページ数とクレジットが確定します。
                                      </p>
                                      <p>
                                        月次の無料枠の残り:{" "}
                                        <span className="font-medium text-foreground">
                                          {(companyRagUnitsRemaining ?? 0).toLocaleString("ja-JP")} ページ
                                        </span>
                                        （URL と PDF を合算）
                                      </p>
                                    </div>
                                  ) : (
                                    <div className="space-y-2">
                                      <p className="font-medium text-foreground">取り込みと消費の目安</p>
                                      <dl className="space-y-1.5">
                                        <div>
                                          <dt className="text-[10px] font-medium text-muted-foreground">
                                            PDFのページ数（端末での目安）
                                          </dt>
                                          <dd className="mt-0.5 text-foreground">
                                            合計{" "}
                                            <span className="font-semibold">
                                              {pdfCreditPreview.totalPages.toLocaleString("ja-JP")}
                                            </span>{" "}
                                            ページ（{pdfDraft.uploadFiles.length} ファイル）
                                          </dd>
                                        </div>
                                        <div>
                                          <dt className="text-[10px] font-medium text-muted-foreground">
                                            処理するページの見込み
                                          </dt>
                                          <dd className="mt-0.5 text-foreground">
                                            最大{" "}
                                            <span className="font-semibold">
                                              {pdfCreditPreview.effectiveTotalPages.toLocaleString("ja-JP")}
                                            </span>{" "}
                                            ページ
                                            <span className="text-muted-foreground">
                                              （1ファイルあたり先頭から最大{" "}
                                              {pdfCreditPreview.maxPdfIngestPages.toLocaleString("ja-JP")}{" "}
                                              ページまで）
                                            </span>
                                          </dd>
                                        </div>
                                        {pdfCreditPreview.willTruncateIngest ? (
                                          <div className="rounded-md border border-amber-200/80 bg-amber-50/90 px-2 py-1.5 text-amber-950">
                                            元のページ数が上限を超えているため、先頭から切り詰めて取り込みます。
                                          </div>
                                        ) : null}
                                        <div>
                                          <dt className="text-[10px] font-medium text-muted-foreground">
                                            無料枠の充当見込み
                                          </dt>
                                          <dd className="mt-0.5 text-foreground">
                                            約{" "}
                                            <span className="font-semibold">
                                              {pdfCreditPreview.totalFreeFromQuota.toLocaleString("ja-JP")}
                                            </span>{" "}
                                            ページ
                                            <span className="text-muted-foreground">
                                              （URL と PDF の月次枠を合算して先に充当）
                                            </span>
                                          </dd>
                                        </div>
                                        <div>
                                          <dt className="text-[10px] font-medium text-muted-foreground">
                                            クレジットの見込み
                                          </dt>
                                          <dd className="mt-0.5 text-foreground">
                                            約{" "}
                                            <span className="font-semibold">
                                              {pdfCreditPreview.totalCredits.toLocaleString("ja-JP")}
                                            </span>
                                            <span className="text-muted-foreground">
                                              {" "}
                                              （上記の処理ページ数から換算。確定は取り込み完了時）
                                            </span>
                                          </dd>
                                        </div>
                                      </dl>
                                    </div>
                                  )}
                                </div>
                              ) : null}
                            </div>
                          ) : (
                            <div className="space-y-2 text-center">
                              <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl border border-border/70 bg-background text-muted-foreground">
                                <FileUploadIcon />
                              </div>
                              <div>
                                <p className="text-sm font-medium text-foreground">
                                  PDFをドロップまたはクリックして選択
                                </p>
                                <p className="mt-1 text-xs text-muted-foreground">
                                  会社案内、統合報告書、採用資料などを一括で取り込めます。
                                </p>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {!isResultDisplayed && (
              <div className="shrink-0 border-t bg-muted/15 px-4 py-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                      <span>登録済みソース</span>
                      <span>
                        {totalSources} / {pageLimit || 0}
                      </span>
                    </div>
                    <div className="mt-2 h-2 rounded-full bg-muted">
                      <div
                        className="h-2 rounded-full bg-primary transition-all"
                        style={{ width: `${sourceUsagePercent}%` }}
                      />
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center justify-end gap-2 self-end sm:self-auto">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={closeModal}
                      disabled={isModalBusy}
                    >
                      {showWebReviewStep ? "閉じる" : "キャンセル"}
                    </Button>
                    {showWebReviewStep && (
                      <Button
                        size="sm"
                        onClick={handleFetchCorporateInfo}
                        disabled={isFetching || isUploading || webDraft.selectedUrls.length === 0}
                      >
                        {isFetching ? (
                          <>
                            <LoadingSpinner />
                            <span className="ml-2">取得中...</span>
                          </>
                        ) : (
                          "選択したURLを取得"
                        )}
                      </Button>
                    )}
                    {showConfigureStep && inputMode === "url" && (
                      <Button
                        size="sm"
                        onClick={handleFetchCorporateInfo}
                        disabled={
                          isFetching ||
                          isUploading ||
                          parsedCustomUrls.urls.length === 0 ||
                          parsedCustomUrls.invalidLines.length > 0
                        }
                      >
                        {isFetching ? (
                          <>
                            <LoadingSpinner />
                            <span className="ml-2">取得中...</span>
                          </>
                        ) : (
                          "URLから取得"
                        )}
                      </Button>
                    )}
                    {showConfigureStep &&
                      inputMode === "pdf" &&
                      !pdfUploadProgress &&
                      pdfDraft.uploadFiles.length > 0 && (
                        <>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              document.getElementById(pdfUploadInputId)?.click();
                            }}
                            disabled={isUploading}
                          >
                            追加選択
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => {
                              void handleUploadPdf();
                            }}
                            disabled={isUploading}
                          >
                            {isUploading ? (
                              <>
                                <LoadingSpinner />
                                <span className="ml-2">取り込み中...</span>
                              </>
                            ) : (
                              `${pdfDraft.uploadFiles.length}件を取り込む`
                            )}
                          </Button>
                        </>
                      )}
                  </div>
                </div>
              </div>
            )}
          </Card>
        </div>
      )}

      {/* Registered Sources Modal */}
      {showUrlModal && status?.corporateInfoUrls && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <Card className="flex h-[78vh] max-h-[760px] min-h-[560px] w-full max-w-2xl flex-col overflow-hidden border-border/50">
            <CardHeader className="gap-3 border-b py-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <CardTitle className="text-lg">登録済みソース</CardTitle>
                  <p className="mt-1 text-sm text-muted-foreground">
                    URL とアップロード資料をまとめて管理します
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closeUrlModal}
                  className="rounded-full p-1.5 transition-colors hover:bg-background/70"
                  disabled={isDeleting}
                >
                  <XIcon />
                </button>
              </div>
            </CardHeader>
            <CardContent className="flex-1 overflow-y-auto py-5">
              {status.corporateInfoUrls.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border/80 bg-muted/20 px-5 py-10 text-center">
                  <p className="text-sm font-medium text-foreground">
                    登録済みのソースはありません
                  </p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    企業情報を取得すると、ここに一覧で表示されます。
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className={cn(SURFACE_CLASS, "p-4")}>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <button
                        type="button"
                        onClick={toggleSelectAllForDelete}
                        disabled={isDeleting}
                        className="flex items-center gap-3 text-sm text-muted-foreground transition-colors hover:text-foreground"
                      >
                        <span
                          className={cn(
                            "flex h-5 w-5 items-center justify-center rounded-md border-2 transition-colors",
                            selectedUrlsForDelete.size === status.corporateInfoUrls.length
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-muted-foreground/40"
                          )}
                        >
                          {selectedUrlsForDelete.size === status.corporateInfoUrls.length && (
                            <CheckIcon />
                          )}
                        </span>
                        すべて選択
                      </button>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span className="rounded-full border border-border/60 bg-muted/20 px-2.5 py-1">
                          全 {status.corporateInfoUrls.length} 件
                        </span>
                        {selectedUrlsForDelete.size > 0 && (
                          <span className="rounded-full border border-destructive/20 bg-destructive/5 px-2.5 py-1 text-destructive">
                            {selectedUrlsForDelete.size}件選択中
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    {status.corporateInfoUrls.map((urlInfo, i) => {
                      const resolvedType = urlInfo.contentType || (urlInfo.type ? mapLegacyToNew(urlInfo.type) : null);
                      const secondaryTypes = Array.isArray(urlInfo.secondaryContentTypes)
                        ? urlInfo.secondaryContentTypes
                        : [];
                      const uploadSource = urlInfo.kind === "upload_pdf" || isUploadSource(urlInfo.url);
                      const colors = resolvedType
                        ? CONTENT_TYPE_COLORS[resolvedType] || {
                            bg: "bg-gray-100",
                            text: "text-gray-700",
                          }
                        : null;
                      const label = resolvedType
                        ? CONTENT_TYPE_LABELS[resolvedType] || CONTENT_TYPE_LABELS["corporate_site"]
                        : null;
                      const statusMeta = getSourceStatusMeta(urlInfo.status);
                      const isSelected = selectedUrlsForDelete.has(urlInfo.url);
                      const isBlocked = urlInfo.complianceStatus === "blocked";
                      const isWarning = urlInfo.complianceStatus === "warning";

                      return (
                        <div
                          key={i}
                          className={cn(
                            SURFACE_CLASS,
                            "flex items-start gap-3 p-4 transition-colors",
                            isSelected
                              ? "border-destructive/25 bg-destructive/5"
                              : "hover:border-border hover:bg-muted/10"
                          )}
                        >
                          <button
                            type="button"
                            onClick={() => toggleUrlForDelete(urlInfo.url)}
                            disabled={isDeleting}
                            className="mt-0.5 flex-shrink-0"
                          >
                            <span
                              className={cn(
                                "flex h-5 w-5 items-center justify-center rounded-md border-2 transition-colors",
                                isSelected
                                  ? "border-destructive bg-destructive text-destructive-foreground"
                                  : "border-muted-foreground/40 hover:border-muted-foreground"
                              )}
                            >
                              {isSelected && <CheckIcon />}
                            </span>
                          </button>

                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              {label && colors ? (
                                <span
                                  className={cn(
                                    "inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium",
                                    colors.bg,
                                    colors.text
                                  )}
                                >
                                  {label}
                                </span>
                              ) : (
                                <span className="inline-flex items-center rounded-full border border-border/60 bg-muted/20 px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
                                  自動判定中
                                </span>
                              )}
                              <span className="inline-flex items-center rounded-full border border-border/60 bg-muted/20 px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
                                {uploadSource ? "PDF" : "URL"}
                              </span>
                              <span
                                className={cn(
                                  "inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium",
                                  statusMeta.className
                                )}
                              >
                                {statusMeta.label}
                              </span>
                              {isBlocked && (
                                <span className="inline-flex items-center rounded-full border border-amber-300 bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-800">
                                  取得対象外
                                </span>
                              )}
                              {isWarning && (
                                <span className="inline-flex items-center rounded-full border border-amber-300 bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-800">
                                  要確認
                                </span>
                              )}
                              {secondaryTypes.map((secondary, idx) => {
                                const secColors = CONTENT_TYPE_COLORS[secondary] || {
                                  bg: "bg-gray-100",
                                  text: "text-gray-700",
                                };
                                const secLabel = CONTENT_TYPE_LABELS[secondary] || CONTENT_TYPE_LABELS["corporate_site"];
                                return (
                                  <span
                                    key={`${secondary}-${idx}`}
                                    className={cn(
                                      "inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium",
                                      secColors.bg,
                                      secColors.text
                                    )}
                                  >
                                    {secLabel}
                                  </span>
                                );
                              })}
                            </div>

                            {uploadSource ? (
                              <div className="mt-3 space-y-1">
                                <p className="break-all text-sm font-medium text-foreground">
                                  {urlInfo.fileName || "アップロードPDF"}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {urlInfo.status === "pending" || urlInfo.status === "processing"
                                    ? "OCRが完了すると自動で分類されます"
                                    : "PDFアップロード"}
                                </p>
                              </div>
                            ) : (
                              <div className="mt-3 space-y-2">
                                <a
                                  href={urlInfo.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="group inline-flex max-w-full items-center gap-1 text-sm font-medium text-primary"
                                >
                                  <span className="truncate group-hover:underline">{urlInfo.url}</span>
                                  <ExternalLinkIcon />
                                </a>
                                <div className="inline-flex items-center rounded-full border border-border/60 bg-muted/20 px-2.5 py-1 text-[11px] text-muted-foreground">
                                  {getHostLabel(urlInfo.url)}
                                </div>
                                {isBlocked && urlInfo.complianceReasons?.[0] && (
                                  <p className="text-xs text-amber-700">{urlInfo.complianceReasons[0]}</p>
                                )}
                                {isWarning && urlInfo.complianceReasons?.[0] && (
                                  <p className="text-xs text-amber-700">{urlInfo.complianceReasons[0]}</p>
                                )}
                              </div>
                            )}

                            {urlInfo.fetchedAt && (
                              <p className="mt-3 text-xs text-muted-foreground">
                                取得日時: {formatTimestamp(urlInfo.fetchedAt)}
                              </p>
                            )}
                            {urlInfo.errorMessage && (
                              <p className="mt-2 text-xs text-destructive">{urlInfo.errorMessage}</p>
                            )}
                          </div>
                        </div>
                      );
                    })}

                    {deleteError && (
                      <div className="rounded-2xl border border-destructive/20 bg-destructive/5 px-4 py-3">
                        <p className="text-sm text-destructive">{deleteError}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </CardContent>

            <div className="flex gap-3 border-t bg-muted/15 px-6 py-4">
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
                <h3 className="text-lg font-semibold mb-2">ソースを削除しますか？</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  選択した{selectedUrlsForDelete.size}件のソースと、それに関連するRAGデータが削除されます。
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
