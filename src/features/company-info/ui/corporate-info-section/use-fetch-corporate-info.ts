"use client";

import { useCallback, useState } from "react";
import { parseApiErrorResponse, toAppUiError } from "@/lib/api-errors";
import { calculatePdfIngestCredits } from "@/lib/company-info/pricing";
import { notifyMessage, notifySuccess } from "@/lib/notifications";
import { notifyUserFacingAppError } from "@/lib/client-error-ui";
import { shouldCloseCorporateFetchModalOnSuccess } from "@/lib/company-info/fetch-ui";
import { checkSourceCompliance, estimateCorporateFetch, fetchCorporateInfo } from "./client-api";
import { formatEstimateSummary } from "./workflow-helpers";
import {
  type ComplianceCheckResponse,
  type ContentType,
  type CrawlEstimateResult,
  type FetchResult,
  type InputMode,
  type ModalStep,
  type WebDraft,
} from "./workflow-config";
import { resolveCorporateContentChannel } from "./use-corporate-info-controller";

const RAG_SUCCESS_SNACKBAR_DELAY_MS = 230;

interface ParsedCustomUrls {
  urls: string[];
  invalidLines: Array<{ lineNumber: number; value: string }>;
}

interface UseFetchCorporateInfoArgs {
  companyId: string;
  companyRagHtmlPagesRemaining: number;
  companyRagPdfPagesRemaining: number;
  webDraft: WebDraft;
  inputMode: InputMode;
  parsedCustomUrls: ParsedCustomUrls;
  resolvedWebContentType: ContentType | null;
  acquireLock: (reason: string) => boolean;
  releaseLock: () => void;
  fetchStatus: () => Promise<void>;
  closeModal: () => void;
  setError: (error: string | null) => void;
  setFetchResult: (result: FetchResult | null) => void;
  setModalStep: (step: ModalStep) => void;
}

export function useFetchCorporateInfo({
  companyId,
  companyRagHtmlPagesRemaining,
  companyRagPdfPagesRemaining,
  webDraft,
  inputMode,
  parsedCustomUrls,
  resolvedWebContentType,
  acquireLock,
  releaseLock,
  fetchStatus,
  closeModal,
  setError,
  setFetchResult,
  setModalStep,
}: UseFetchCorporateInfoArgs) {
  const [isFetching, setIsFetching] = useState(false);

  const handleFetchCorporateInfo = useCallback(async () => {
    let urlsToFetch = [...webDraft.selectedUrls];

    if (inputMode === "url") {
      if (parsedCustomUrls.invalidLines.length > 0) {
        setError(
          "URLの形式が正しくない行があります。http:// または https:// で始まるURLを1行ずつ入力してください。",
        );
        return;
      }
      urlsToFetch = parsedCustomUrls.urls;
    }

    if (urlsToFetch.length === 0) {
      setError(inputMode === "url" ? "URLを入力してください" : "URLを選択してください");
      return;
    }
    if (!resolvedWebContentType) {
      setError("コンテンツ種別を選択してください");
      return;
    }

    if (inputMode === "url") {
      try {
        const complianceResponse = await checkSourceCompliance(companyId, urlsToFetch);
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

    let estimateResult: CrawlEstimateResult | null = null;
    try {
      const response = await estimateCorporateFetch(companyId, {
        urls: urlsToFetch,
        contentType: resolvedWebContentType,
        contentChannel: resolveCorporateContentChannel(resolvedWebContentType),
      });
      const data = (await response.json().catch(() => ({}))) as CrawlEstimateResult;
      if (!response.ok) {
        const message = data.errors?.[0] ?? data.error ?? "企業情報の実行前見積に失敗しました。";
        throw new Error(message);
      }

      let remainingHtml = Math.max(0, companyRagHtmlPagesRemaining ?? 0);
      let remainingPdf = Math.max(0, companyRagPdfPagesRemaining ?? 0);
      let estimatedFreeHtmlPages = 0;
      let estimatedFreePdfPages = 0;
      let estimatedCredits = 0;
      for (const url of urlsToFetch) {
        const summary = data.page_routing_summaries?.[url];
        const ingestPages =
          summary && typeof summary.ingest_pages === "number"
            ? Math.max(0, Math.floor(summary.ingest_pages as number))
            : 1;
        if (summary && typeof summary.ingest_pages === "number") {
          const freeApplied = Math.min(ingestPages, remainingPdf);
          estimatedFreePdfPages += freeApplied;
          remainingPdf -= freeApplied;
          estimatedCredits += calculatePdfIngestCredits(ingestPages - freeApplied);
        } else {
          const freeApplied = Math.min(1, remainingHtml);
          estimatedFreeHtmlPages += freeApplied;
          remainingHtml -= freeApplied;
          estimatedCredits += Math.max(0, 1 - freeApplied);
        }
      }

      estimateResult = {
        ...data,
        estimated_free_html_pages: estimatedFreeHtmlPages,
        estimated_free_pdf_pages: estimatedFreePdfPages,
        estimated_credits: estimatedCredits,
        requires_confirmation:
          estimatedCredits > 0 ||
          (data.estimated_mistral_ocr_pages ?? 0) > 0 ||
          data.will_truncate,
      };
      if (estimateResult.requires_confirmation) {
        const confirmText = [
          "企業情報の取得を実行します。",
          formatEstimateSummary({
            totalPages: estimateResult.estimated_pages_crawled,
            localPages: Math.max(
              0,
              estimateResult.estimated_pages_crawled -
                estimateResult.estimated_google_ocr_pages -
                estimateResult.estimated_mistral_ocr_pages,
            ),
            googlePages: estimateResult.estimated_google_ocr_pages,
            mistralPages: estimateResult.estimated_mistral_ocr_pages,
            freePages:
              estimateResult.estimated_free_html_pages + estimateResult.estimated_free_pdf_pages,
            credits: estimateResult.estimated_credits,
            willTruncate: estimateResult.will_truncate,
          }),
          "続行しますか？",
        ].join("\n");
        if (!window.confirm(confirmText)) {
          return;
        }
      }
    } catch (err) {
      const uiError = toAppUiError(
        err,
        {
          code: "CORPORATE_FETCH_FAILED",
          userMessage: "企業情報の見積を取得できませんでした。",
          action: "しばらく待ってから、もう一度お試しください。",
          retryable: true,
        },
        "CorporateInfoSection.handleFetchCorporateInfo",
      );
      setError(uiError.message);
      notifyUserFacingAppError(uiError);
      return;
    }
    if (!acquireLock("企業情報ページを取得中")) return;

    setIsFetching(true);
    setError(null);
    setFetchResult(null);

    try {
      const contentChannel = resolveCorporateContentChannel(resolvedWebContentType);
      const response = await fetchCorporateInfo(companyId, {
        urls: urlsToFetch,
        contentChannel,
        contentType: resolvedWebContentType,
      });

      if (response.status === 402) {
        const uiError = await parseApiErrorResponse(
          response,
          {
            code: "CORPORATE_FETCH_LIMIT_REACHED",
            userMessage: "この操作は現在利用できませんでした。",
            action: "プランや残高を確認して、もう一度お試しください。",
          },
          "CorporateInfoSection.handleFetchCorporateInfo",
        );
        setError(uiError.message);
        notifyUserFacingAppError(uiError);
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
          "CorporateInfoSection.handleFetchCorporateInfo",
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
            description:
              `${chunks.toLocaleString()} チャンクを保存しました。ES添削・志望動機・企業内検索で参照できます。${costNote}`.trim(),
            duration: 4800,
          });
        }, RAG_SUCCESS_SNACKBAR_DELAY_MS);
      } else if (result.success && chunks === 0 && (result.pagesCrawled ?? 0) > 0) {
        closeModal();
        window.setTimeout(() => {
          notifyMessage(
            "ページの取得は完了しましたが、保存されたチャンクがありません。別のURLを試してください。",
            5200,
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
        "CorporateInfoSection.handleFetchCorporateInfo",
      );
      setError(uiError.message);
      notifyUserFacingAppError(uiError);
    } finally {
      setIsFetching(false);
      releaseLock();
    }
  }, [
    acquireLock,
    companyId,
    companyRagHtmlPagesRemaining,
    companyRagPdfPagesRemaining,
    closeModal,
    fetchStatus,
    inputMode,
    parsedCustomUrls.invalidLines.length,
    parsedCustomUrls.urls,
    resolvedWebContentType,
    releaseLock,
    webDraft.selectedUrls,
    setError,
    setFetchResult,
    setModalStep,
  ]);

  return { isFetching, handleFetchCorporateInfo };
}
