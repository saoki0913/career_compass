export type { ContentType } from "@/lib/company-info/sources";
import type { ContentType, CorporateInfoSource as CorporateInfoUrl } from "@/lib/company-info/sources";

export interface RagStatus {
  hasRag: boolean;
  totalChunks: number;
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

export interface CorporateInfoStatus {
  companyId: string;
  corporateInfoUrls: CorporateInfoUrl[];
  corporateInfoFetchedAt: string | null;
  ragStatus: RagStatus;
  pageLimit: number;
}

export interface SearchCandidate {
  url: string;
  title: string;
  snippet?: string;
  confidence: "high" | "medium" | "low";
  sourceType?: "official" | "job_site" | "parent" | "subsidiary" | "blog" | "other";
  relationCompanyName?: string | null;
  complianceStatus?: "allowed" | "warning" | "blocked";
  complianceReasons?: string[];
}

export interface ComplianceCheckResponse {
  blockedResults: Array<{ url: string; reasons: string[] }>;
  warningResults: Array<{ url: string; reasons: string[] }>;
}

export type BatchUploadStatus = "completed" | "pending" | "failed" | "skipped_limit";

export type BatchUploadItem = {
  fileName: string;
  status: BatchUploadStatus;
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

export type PdfFileStatus = "waiting" | "uploading" | "completed" | "failed";

export interface PdfFileProgress {
  file: File;
  status: PdfFileStatus;
  error?: string;
  result?: BatchUploadItem;
}

export interface FetchResult {
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

export interface PdfEstimateResult {
  success: boolean;
  estimated_free_pdf_pages: number;
  estimated_credits: number;
  estimated_google_ocr_pages: number;
  estimated_mistral_ocr_pages: number;
  will_truncate: boolean;
  requires_confirmation: boolean;
  processing_notice_ja?: string | null;
  page_routing_summary?: {
    total_pages: number;
    ingest_pages: number;
    local_pages: number;
    google_ocr_pages: number;
    mistral_ocr_pages: number;
    truncated_pages: number;
    planned_route: string[];
    actual_route: string[];
  };
  errors?: string[];
}

export interface CrawlEstimateResult {
  success: boolean;
  estimated_pages_crawled: number;
  estimated_html_pages: number;
  estimated_pdf_pages: number;
  estimated_free_html_pages: number;
  estimated_free_pdf_pages: number;
  estimated_credits: number;
  estimated_google_ocr_pages: number;
  estimated_mistral_ocr_pages: number;
  will_truncate: boolean;
  requires_confirmation: boolean;
  /** Next API のエラー応答（単数）。`errors` と併用されうる */
  error?: string;
  errors?: string[];
  page_routing_summaries?: Record<string, Record<string, unknown>>;
}

export const CONTENT_TYPE_TO_CHANNEL: Record<ContentType, "corporate_ir" | "corporate_general"> = {
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

export type PdfUploadContentType =
  | "new_grad_recruitment"
  | "midcareer_recruitment"
  | "corporate_site"
  | "ir_materials"
  | "employee_interviews"
  | "csr_sustainability"
  | "midterm_plan";

export const PDF_UPLOAD_CONTENT_TYPE_OPTIONS: Array<{ value: PdfUploadContentType; label: string }> = [
  { value: "ir_materials", label: "IR資料・決算資料" },
  { value: "midterm_plan", label: "中期経営計画・経営方針" },
  { value: "new_grad_recruitment", label: "採用資料・会社説明会資料" },
  { value: "employee_interviews", label: "社員紹介・カルチャー資料" },
  { value: "csr_sustainability", label: "サステナ・CSR資料" },
  { value: "corporate_site", label: "会社概要・その他" },
];

export const DEFAULT_PDF_UPLOAD_CONTENT_TYPE: PdfUploadContentType = "corporate_site";

const LEGACY_TO_NEW_TYPE: Record<string, ContentType> = {
  ir: "ir_materials",
  business: "corporate_site",
  about: "corporate_site",
  general: "corporate_site",
  recruitment_homepage: "new_grad_recruitment",
};

export function mapLegacyToNew(legacyType: string): ContentType {
  return LEGACY_TO_NEW_TYPE[legacyType] || "corporate_site";
}

export const CONTENT_TYPE_OPTIONS: Array<{ value: ContentType; label: string }> = [
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

export type InputMode = "web" | "url" | "pdf";
export type ModalStep = "configure" | "review" | "result";
export type WebModalStep = Exclude<ModalStep, "result">;
export type WebSearchKind = "type" | "custom";

export interface WebDraft {
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

export interface UrlDraft {
  customUrlInput: string;
}

export interface PdfDraft {
  uploadFiles: File[];
  uploadFileContentTypes: Record<string, PdfUploadContentType>;
}

export function createInitialWebDraft(): WebDraft {
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

export function createInitialUrlDraft(): UrlDraft {
  return {
    customUrlInput: "",
  };
}

export function createInitialPdfDraft(): PdfDraft {
  return {
    uploadFiles: [],
    uploadFileContentTypes: {},
  };
}
