"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { parseApiErrorResponse, toAppUiError } from "@/lib/api-errors";
import { notifyMessage, notifySuccess } from "@/lib/notifications";
import { notifyUserFacingAppError } from "@/lib/client-error-ui";
import { shouldCloseCorporateFetchModalOnSuccess } from "@/lib/company-info/fetch-ui";
import { getPdfPageCountFromFile } from "@/lib/company-info/pdf-page-count";
import { estimateCorporatePdfUpload, uploadCorporatePdf } from "./client-api";
import { formatEstimateSummary, pdfFileKey } from "./workflow-helpers";
import {
  type BatchUploadItem,
  type FetchResult,
  type ModalStep,
  type PdfDraft,
  type PdfEstimateResult,
  type PdfFileProgress,
  DEFAULT_PDF_UPLOAD_CONTENT_TYPE,
} from "./workflow-config";

const RAG_SUCCESS_SNACKBAR_DELAY_MS = 230;

interface UsePdfUploadArgs {
  companyId: string;
  companyRagPdfPagesRemaining: number;
  pdfDraft: PdfDraft;
  acquireLock: (reason: string) => boolean;
  releaseLock: () => void;
  fetchStatus: () => Promise<void>;
  closeModal: () => void;
  setError: (error: string | null) => void;
  setFetchResult: (result: FetchResult | null) => void;
  setModalStep: (step: ModalStep) => void;
  setDisplayedStep: (step: ModalStep) => void;
  setIsStepTransitioning: (transitioning: boolean) => void;
}

export function usePdfUpload({
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
}: UsePdfUploadArgs) {
  const [isUploading, setIsUploading] = useState(false);
  const [pdfUploadProgress, setPdfUploadProgress] = useState<PdfFileProgress[] | null>(null);
  const [pdfPageEstimates, setPdfPageEstimates] = useState<Record<string, number | null>>({});
  const [pdfEstimate, setPdfEstimate] = useState<PdfEstimateResult | null>(null);
  const [pdfEstimateLoading, setPdfEstimateLoading] = useState(false);

  const pdfUploadFileSignature = useMemo(
    () => pdfDraft.uploadFiles.map(pdfFileKey).join("|"),
    [pdfDraft.uploadFiles],
  );

  useEffect(() => {
    const files = pdfDraft.uploadFiles;
    if (files.length === 0) {
      setPdfPageEstimates({});
      return;
    }

    let cancelled = false;
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
    })();

    return () => {
      cancelled = true;
    };
  }, [pdfUploadFileSignature]);

  useEffect(() => {
    const files = pdfDraft.uploadFiles;
    if (files.length === 0) {
      setPdfEstimate(null);
      setPdfEstimateLoading(false);
      return;
    }

    let cancelled = false;
    setPdfEstimateLoading(true);

    void (async () => {
      try {
        let remaining = Math.max(0, companyRagPdfPagesRemaining ?? 0);
        const aggregate: PdfEstimateResult = {
          success: true,
          estimated_free_pdf_pages: 0,
          estimated_credits: 0,
          estimated_google_ocr_pages: 0,
          estimated_mistral_ocr_pages: 0,
          will_truncate: false,
          requires_confirmation: false,
          errors: [],
        };

        for (const file of files) {
          const key = pdfFileKey(file);
          const pageCount = pdfPageEstimates[key];
          if (pageCount === undefined || pageCount === null) {
            setPdfEstimate(null);
            setPdfEstimateLoading(false);
            return;
          }

          const formData = new FormData();
          formData.set("company_id", companyId);
          formData.set(
            "source_url",
            `upload://corporate-pdf/${companyId}/estimate/${key}`,
          );
          formData.set(
            "content_type",
            pdfDraft.uploadFileContentTypes[key] || DEFAULT_PDF_UPLOAD_CONTENT_TYPE,
          );
          formData.set("remaining_free_pdf_pages", String(remaining));
          formData.set("file", file, file.name);

          const response = await estimateCorporatePdfUpload(companyId, formData);
          const data = (await response.json().catch(() => ({}))) as PdfEstimateResult;
          if (!response.ok) {
            throw new Error(data.errors?.[0] || "PDFの見積に失敗しました。");
          }

          aggregate.estimated_free_pdf_pages += data.estimated_free_pdf_pages || 0;
          aggregate.estimated_credits += data.estimated_credits || 0;
          aggregate.estimated_google_ocr_pages += data.estimated_google_ocr_pages || 0;
          aggregate.estimated_mistral_ocr_pages += data.estimated_mistral_ocr_pages || 0;
          aggregate.will_truncate = aggregate.will_truncate || Boolean(data.will_truncate);
          aggregate.requires_confirmation =
            aggregate.requires_confirmation || Boolean(data.requires_confirmation);
          if (data.processing_notice_ja) {
            aggregate.processing_notice_ja = data.processing_notice_ja;
          }
          if (data.page_routing_summary) {
            const prev = aggregate.page_routing_summary;
            if (prev) {
              aggregate.page_routing_summary = {
                ...prev,
                local_pages: (prev.local_pages ?? 0) + (data.page_routing_summary.local_pages ?? 0),
                google_ocr_pages: (prev.google_ocr_pages ?? 0) + (data.page_routing_summary.google_ocr_pages ?? 0),
                mistral_ocr_pages: (prev.mistral_ocr_pages ?? 0) + (data.page_routing_summary.mistral_ocr_pages ?? 0),
              };
            } else {
              aggregate.page_routing_summary = { ...data.page_routing_summary };
            }
          }
          remaining = Math.max(0, remaining - (data.estimated_free_pdf_pages || 0));
        }

        if (!cancelled) {
          setPdfEstimate(aggregate);
        }
      } catch {
        if (!cancelled) {
          setPdfEstimate(null);
        }
      } finally {
        if (!cancelled) {
          setPdfEstimateLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    companyId,
    companyRagPdfPagesRemaining,
    pdfDraft.uploadFiles,
    pdfDraft.uploadFileContentTypes,
    pdfPageEstimates,
    pdfUploadFileSignature,
  ]);

  const handleUploadPdf = useCallback(async () => {
    if (pdfDraft.uploadFiles.length === 0) {
      setError("PDFファイルを選択してください");
      return;
    }
    if (pdfEstimateLoading || !pdfEstimate) {
      setError("PDFの実行前見積を取得中です。しばらく待ってからもう一度お試しください。");
      return;
    }
    if (pdfEstimate.requires_confirmation) {
      const totalPages = pdfDraft.uploadFiles.reduce((sum, file) => {
        const key = pdfFileKey(file);
        return sum + Math.max(pdfPageEstimates[key] ?? 0, 0);
      }, 0);
      const routing = pdfEstimate.page_routing_summary;
      const confirmText = [
        "PDFの取り込みを実行します。",
        formatEstimateSummary({
          totalPages,
          localPages: routing?.local_pages ?? 0,
          googlePages: pdfEstimate.estimated_google_ocr_pages,
          mistralPages: pdfEstimate.estimated_mistral_ocr_pages,
          freePages: pdfEstimate.estimated_free_pdf_pages,
          credits: pdfEstimate.estimated_credits,
          willTruncate: pdfEstimate.will_truncate,
        }),
        pdfEstimate.processing_notice_ja || "",
        "続行しますか？",
      ]
        .filter(Boolean)
        .join("\n");
      if (!window.confirm(confirmText)) {
        return;
      }
    }
    if (!acquireLock("企業情報PDFを取り込み中")) return;

    setIsUploading(true);
    setError(null);
    setFetchResult(null);
    setModalStep("configure");
    setDisplayedStep("configure");
    setIsStepTransitioning(false);
    setPdfUploadProgress(pdfDraft.uploadFiles.map((file) => ({ file, status: "waiting" })));

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
            progressIndex === index
              ? { ...progress, status: "uploading", error: undefined }
              : progress,
          ) ?? null,
        );

        try {
          const formData = new FormData();
          formData.append("file", file);
          const contentType =
            pdfDraft.uploadFileContentTypes[pdfFileKey(file)] || DEFAULT_PDF_UPLOAD_CONTENT_TYPE;
          formData.append("contentType", contentType);

          const response = await uploadCorporatePdf(companyId, formData);

          if (!response.ok) {
            throw await parseApiErrorResponse(
              response,
              {
                code: "CORPORATE_UPLOAD_FAILED",
                userMessage: "PDFを取り込めませんでした。",
                action: "ファイルや設定を確認して、もう一度お試しください。",
                retryable: true,
              },
              "CorporateInfoSection.handleUploadPdf",
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
            typeof result.remainingFreeUnits === "number"
              ? result.remainingFreeUnits
              : latestRemainingFreeUnits;
          latestEstimatedCostBand =
            typeof result.estimatedCostBand === "string"
              ? result.estimatedCostBand
              : latestEstimatedCostBand;

          setPdfUploadProgress((prev) =>
            prev?.map((progress, progressIndex) =>
              progressIndex === index
                ? {
                    ...progress,
                    status: item.status === "completed" ? "completed" : "failed",
                    error: item.error,
                    result: item,
                  }
                : progress,
            ) ?? null,
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
            "CorporateInfoSection.handleUploadPdf",
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
                : progress,
            ) ?? null,
          );
        }
      }

      const completedCount = allItems.filter((item) => item.status === "completed").length;
      const failedCount = allItems.filter((item) => item.status === "failed").length;
      const skippedLimitCount = allItems.filter(
        (item) => item.status === "skipped_limit",
      ).length;
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
            description:
              `PDF ${completedCount} 件、計 ${totalChunks.toLocaleString()} チャンクを保存しました。ES添削・志望動機・企業内検索で参照できます。${costNote}${failNote}`.trim(),
            duration: 5200,
          });
        }, RAG_SUCCESS_SNACKBAR_DELAY_MS);
      } else if (completedCount > 0 && totalChunks === 0) {
        window.setTimeout(() => {
          notifyMessage(
            "PDFの取り込みは完了しましたが、保存されたチャンクがありません。",
            4800,
          );
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
        "CorporateInfoSection.handleUploadPdf",
      );
      setError(uiError.message);
      notifyUserFacingAppError(uiError);
    } finally {
      setIsUploading(false);
      releaseLock();
    }
  }, [
    acquireLock,
    companyId,
    closeModal,
    fetchStatus,
    pdfDraft.uploadFileContentTypes,
    pdfDraft.uploadFiles,
    pdfEstimate,
    pdfEstimateLoading,
    pdfPageEstimates,
    releaseLock,
    setError,
    setFetchResult,
    setModalStep,
    setDisplayedStep,
    setIsStepTransitioning,
  ]);

  return {
    isUploading,
    pdfUploadProgress,
    setPdfUploadProgress,
    pdfPageEstimates,
    pdfEstimate,
    pdfEstimateLoading,
    handleUploadPdf,
  };
}
