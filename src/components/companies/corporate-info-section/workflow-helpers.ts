import type { CorporateInfoSourceStatus } from "@/lib/company-info/sources";

import {
  DEFAULT_PDF_UPLOAD_CONTENT_TYPE,
  PDF_UPLOAD_CONTENT_TYPE_OPTIONS,
  type BatchUploadStatus,
  type PdfDraft,
  type PdfFileStatus,
  type PdfUploadContentType,
  type SearchCandidate,
} from "./workflow-config";

export function formatEstimateSummary(parts: {
  totalPages: number;
  localPages: number;
  googlePages: number;
  mistralPages: number;
  freePages: number;
  credits: number;
  willTruncate: boolean;
}) {
  const segments = [
    `総ページ ${parts.totalPages}`,
    `local ${parts.localPages}`,
    `Google OCR ${parts.googlePages}`,
    `Mistral OCR ${parts.mistralPages}`,
    `無料枠 ${parts.freePages}`,
    `credits ${parts.credits}`,
  ];
  if (parts.willTruncate) {
    segments.push("切り詰めあり");
  }
  return segments.join(" / ");
}

export function mergePdfFiles(nextFiles: FileList | File[] | null | undefined, currentFiles: File[]) {
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
        current.lastModified === file.lastModified,
    );
    if (!exists) {
      merged.push(file);
    }
  }
  return merged;
}

export function removePdfFile(files: File[], target: File) {
  return files.filter(
    (file) =>
      !(
        file.name === target.name &&
        file.size === target.size &&
        file.lastModified === target.lastModified
      ),
  );
}

export function pdfFileKey(file: File) {
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

export function getPdfUploadContentTypeLabel(value: PdfUploadContentType) {
  const option = PDF_UPLOAD_CONTENT_TYPE_OPTIONS.find((entry) => entry.value === value);
  return option?.label || "会社概要・その他";
}

export function mergePdfDraftFiles(prev: PdfDraft, nextFiles: FileList | File[] | null | undefined): PdfDraft {
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

export function removePdfDraftFile(prev: PdfDraft, target: File): PdfDraft {
  const nextContentTypes = { ...prev.uploadFileContentTypes };
  delete nextContentTypes[pdfFileKey(target)];

  return {
    uploadFiles: removePdfFile(prev.uploadFiles, target),
    uploadFileContentTypes: nextContentTypes,
  };
}

export function getSourceStatusMeta(status?: CorporateInfoSourceStatus) {
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

export function getBatchItemStatusMeta(status: BatchUploadStatus) {
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

export function getPdfFileStatusMeta(status: PdfFileStatus) {
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

export function formatTimestamp(
  value?: string | null,
  options?: Intl.DateTimeFormatOptions,
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
    },
  );
}

export function getHostLabel(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function truncateText(text?: string, maxLength = 140) {
  if (!text) return null;
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return null;
  return normalized.length > maxLength
    ? `${normalized.slice(0, maxLength)}…`
    : normalized;
}

export function parseUrlListInput(input: string) {
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

export function formatCandidateUrl(url: string, maxLength = 56) {
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

export function isRecommendedCandidate(candidate: SearchCandidate) {
  return candidate.sourceType === "official" && candidate.confidence === "high";
}
