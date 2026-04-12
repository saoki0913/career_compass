"use client";

import { cn } from "@/lib/utils";
import { CheckIcon, FileUploadIcon, LoadingSpinner, XIcon } from "./icons";
import { getPdfFileStatusMeta, getPdfUploadContentTypeLabel, mergePdfDraftFiles, removePdfDraftFile, pdfFileKey } from "./workflow-helpers";
import {
  DEFAULT_PDF_UPLOAD_CONTENT_TYPE,
  PDF_UPLOAD_CONTENT_TYPE_OPTIONS,
  type PdfDraft,
  type PdfEstimateResult,
  type PdfFileProgress,
  type PdfUploadContentType,
} from "./workflow-config";

interface PdfUploadStepProps {
  pdfDraft: PdfDraft;
  setPdfDraft: React.Dispatch<React.SetStateAction<PdfDraft>>;
  pdfUploadProgress: PdfFileProgress[] | null;
  pdfPageEstimates: Record<string, number | null>;
  pdfEstimate: PdfEstimateResult | null;
  pdfEstimateLoading: boolean;
  isUploading: boolean;
  isFetching: boolean;
  isSearching: boolean;
  pdfUploadInputId: string;
  ragPdfPolicySummaryJa: string;
}

export function PdfUploadStep({
  pdfDraft,
  setPdfDraft,
  pdfUploadProgress,
  pdfPageEstimates,
  pdfEstimate,
  pdfEstimateLoading,
  isUploading,
  isFetching,
  isSearching,
  pdfUploadInputId,
  ragPdfPolicySummaryJa,
}: PdfUploadStepProps) {
  return (
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
          <ProgressView pdfUploadProgress={pdfUploadProgress} />
        ) : pdfDraft.uploadFiles.length > 0 ? (
          <FileListView
            pdfDraft={pdfDraft}
            setPdfDraft={setPdfDraft}
            pdfPageEstimates={pdfPageEstimates}
            pdfEstimate={pdfEstimate}
            pdfEstimateLoading={pdfEstimateLoading}
          />
        ) : (
          <EmptyDropzone />
        )}
      </div>
    </div>
  );
}

function ProgressView({ pdfUploadProgress }: { pdfUploadProgress: PdfFileProgress[] }) {
  return (
    <div className="w-full space-y-3">
      <div>
        <p className="text-sm font-semibold text-foreground">PDF取り込み中</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {
            pdfUploadProgress.filter(
              (item) => item.status === "completed" || item.status === "failed"
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
                (item) => item.status === "completed" || item.status === "failed"
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
  );
}

function FileListView({
  pdfDraft,
  setPdfDraft,
  pdfPageEstimates,
  pdfEstimate,
  pdfEstimateLoading,
}: {
  pdfDraft: PdfDraft;
  setPdfDraft: React.Dispatch<React.SetStateAction<PdfDraft>>;
  pdfPageEstimates: Record<string, number | null>;
  pdfEstimate: PdfEstimateResult | null;
  pdfEstimateLoading: boolean;
}) {
  return (
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
              <p className="truncate text-xs font-medium text-foreground">{file.name}</p>
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
      {pdfEstimateLoading ? (
        <div className="rounded-lg border border-border/60 bg-muted/15 px-3 py-2.5 text-left text-[11px] leading-relaxed text-muted-foreground">
          PDF の実行前見積を取得しています…
        </div>
      ) : pdfEstimate ? (
        <EstimateView
          pdfEstimate={pdfEstimate}
          pdfDraft={pdfDraft}
          pdfPageEstimates={pdfPageEstimates}
        />
      ) : null}
    </div>
  );
}

function EstimateView({
  pdfEstimate,
  pdfDraft,
  pdfPageEstimates,
}: {
  pdfEstimate: PdfEstimateResult;
  pdfDraft: PdfDraft;
  pdfPageEstimates: Record<string, number | null>;
}) {
  const totalLocalPages = pdfDraft.uploadFiles.reduce((sum, file) => {
    const key = pdfFileKey(file);
    return sum + Math.max(pdfPageEstimates[key] ?? 0, 0);
  }, 0);

  return (
    <div className="max-h-44 overflow-y-auto overscroll-contain rounded-lg border border-border/60 bg-muted/15 px-3 py-2.5 text-left text-[11px] leading-relaxed text-muted-foreground sm:max-h-52">
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
                {totalLocalPages.toLocaleString("ja-JP")}
              </span>{" "}
              ページ（{pdfDraft.uploadFiles.length} ファイル）
            </dd>
          </div>
          <div>
            <dt className="text-[10px] font-medium text-muted-foreground">
              処理するページの見込み
            </dt>
            <dd className="mt-0.5 text-foreground">
              Google OCR{" "}
              <span className="font-semibold">
                {pdfEstimate.estimated_google_ocr_pages.toLocaleString("ja-JP")}
              </span>{" "}
              ページ、Mistral OCR{" "}
              <span className="font-semibold">
                {pdfEstimate.estimated_mistral_ocr_pages.toLocaleString("ja-JP")}
              </span>{" "}
              ページ
            </dd>
          </div>
          {pdfEstimate.will_truncate ? (
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
                {pdfEstimate.estimated_free_pdf_pages.toLocaleString("ja-JP")}
              </span>{" "}
              ページ
              <span className="text-muted-foreground">
                （PDF月次無料枠から先に充当）
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
                {pdfEstimate.estimated_credits.toLocaleString("ja-JP")}
              </span>
              <span className="text-muted-foreground">
                {" "}
                （確定は取り込み完了時）
              </span>
            </dd>
          </div>
        </dl>
      </div>
    </div>
  );
}

function EmptyDropzone() {
  return (
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
  );
}
