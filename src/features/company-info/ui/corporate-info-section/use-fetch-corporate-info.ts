"use client";

import { useCallback, useState } from "react";
import { parseApiErrorResponse, toAppUiError } from "@/lib/api-errors";
import { calculatePdfIngestCredits } from "@/lib/company-info/pricing";
import { notifyMessage, notifySuccess } from "@/lib/notifications";
import { notifyUserFacingAppError } from "@/lib/client-error-ui";
import { shouldCloseCorporateFetchModalOnSuccess } from "@/lib/company-info/fetch-ui";
import { checkSourceCompliance, estimateCorporateFetch, fetchCorporateInfo } from "./client-api";
import {
  type ComplianceCheckResponse,
  type ContentType,
  type CorporateFetchPlan,
  type CrawlEstimateResult,
  type FetchConfirmation,
  type FetchPhase,
  type FetchResult,
  type InputMode,
  type ModalStep,
  type WebDraft,
} from "./workflow-config";
import { resolveCorporateContentChannel } from "./use-corporate-info-controller";

const RAG_SUCCESS_SNACKBAR_DELAY_MS = 230;

function getComplianceReason(reasons?: string[]) {
  return reasons?.[0] || "公開ページURLのみ取得できます";
}

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
  resolvedFetchContentType: ContentType | null;
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
  resolvedFetchContentType,
  acquireLock,
  releaseLock,
  fetchStatus,
  closeModal,
  setError,
  setFetchResult,
  setModalStep,
}: UseFetchCorporateInfoArgs) {
  const [fetchPhase, setFetchPhase] = useState<FetchPhase>("idle");
  const [pendingConfirmation, setPendingConfirmation] = useState<FetchConfirmation | null>(null);

  const releaseToIdle = useCallback(() => {
    setPendingConfirmation(null);
    setFetchPhase("idle");
    releaseLock();
  }, [releaseLock]);

  const executeFetchPlan = useCallback(async (plan: CorporateFetchPlan) => {
    setPendingConfirmation(null);
    setFetchPhase("fetching");
    setError(null);
    setFetchResult(null);

    try {
      const response = await fetchCorporateInfo(companyId, {
        urls: plan.urls,
        contentChannel: plan.contentChannel,
        contentType: plan.contentType,
        confirmedWarningUrls: plan.confirmedWarningUrls,
        quoteId: plan.quoteId,
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
      setPendingConfirmation(null);
      setFetchPhase("idle");
      releaseLock();
    }
  }, [
    closeModal,
    companyId,
    fetchStatus,
    releaseLock,
    setError,
    setFetchResult,
    setModalStep,
  ]);

  const estimateFetchPlan = useCallback(async (plan: CorporateFetchPlan) => {
    setFetchPhase("estimating");

    try {
      const response = await estimateCorporateFetch(companyId, {
        urls: plan.urls,
        contentType: plan.contentType,
        contentChannel: plan.contentChannel,
        confirmedWarningUrls: plan.confirmedWarningUrls,
      });
      if (!response.ok) {
        throw await parseApiErrorResponse(
          response,
          {
            code: "CORPORATE_FETCH_ESTIMATE_FAILED",
            userMessage: "企業情報の見積を取得できませんでした。",
            action: "しばらく待ってから、もう一度お試しください。",
            retryable: true,
          },
          "CorporateInfoSection.handleFetchCorporateInfo.estimate",
        );
      }
      const data = (await response.json().catch(() => ({}))) as CrawlEstimateResult;
      const estimatedPlan: CorporateFetchPlan = {
        ...plan,
        quoteId: data.quoteId,
      };

      let remainingHtml = Math.max(0, companyRagHtmlPagesRemaining ?? 0);
      let remainingPdf = Math.max(0, companyRagPdfPagesRemaining ?? 0);
      let estimatedFreeHtmlPages = 0;
      let estimatedFreePdfPages = 0;
      let estimatedCredits = 0;
      for (const url of plan.urls) {
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

      const estimateResult: CrawlEstimateResult = {
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
        setPendingConfirmation({ kind: "cost_estimate", estimate: estimateResult, plan: estimatedPlan });
        setFetchPhase("confirming");
        return;
      }

      await executeFetchPlan(estimatedPlan);
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
      releaseToIdle();
    }
  }, [
    companyId,
    companyRagHtmlPagesRemaining,
    companyRagPdfPagesRemaining,
    executeFetchPlan,
    releaseToIdle,
    setError,
  ]);

  const handleFetchCorporateInfo = useCallback(async () => {
    if (!acquireLock("企業情報ページを取得準備中")) return;
    setPendingConfirmation(null);
    setFetchPhase("estimating");
    setError(null);

    let urlsToFetch = [...webDraft.selectedUrls];

    if (inputMode === "url") {
      if (parsedCustomUrls.invalidLines.length > 0) {
        setError(
          "URLの形式が正しくない行があります。http:// または https:// で始まるURLを1行ずつ入力してください。",
        );
        releaseToIdle();
        return;
      }
      urlsToFetch = parsedCustomUrls.urls;
    }

    if (urlsToFetch.length === 0) {
      setError(inputMode === "url" ? "URLを入力してください" : "URLを選択してください");
      releaseToIdle();
      return;
    }
    if (!resolvedFetchContentType) {
      setError("コンテンツ種別を選択してください");
      releaseToIdle();
      return;
    }

    const plan: CorporateFetchPlan = {
      inputMode,
      urls: urlsToFetch,
      contentType: resolvedFetchContentType,
      contentChannel: resolveCorporateContentChannel(resolvedFetchContentType),
      confirmedWarningUrls: [],
    };

    let confirmedWarningUrls: string[] = [];
    if (inputMode === "web") {
      const warningCandidates = webDraft.candidates.filter(
        (candidate) =>
          webDraft.selectedUrls.includes(candidate.url) &&
          candidate.complianceStatus === "warning",
      );
      if (warningCandidates.length > 0) {
        const message = getComplianceReason(warningCandidates[0]?.complianceReasons);
        notifyMessage(message);
        confirmedWarningUrls = warningCandidates.map((candidate) => candidate.url);
        const warningPlan = { ...plan, confirmedWarningUrls };
        setPendingConfirmation({ kind: "source_warning", reason: message, plan: warningPlan });
        setFetchPhase("confirming");
        return;
      }
    }

    if (inputMode === "url") {
      try {
        const complianceResponse = await checkSourceCompliance(companyId, urlsToFetch);
        if (complianceResponse.ok) {
          const complianceData: ComplianceCheckResponse = await complianceResponse.json();
          if (complianceData.blockedResults.length > 0) {
            const message = getComplianceReason(complianceData.blockedResults[0]?.reasons);
            setError(message);
            notifyMessage(message);
            releaseToIdle();
            return;
          }
          if (complianceData.warningResults.length > 0) {
            const message = getComplianceReason(complianceData.warningResults[0]?.reasons);
            notifyMessage(message);
            confirmedWarningUrls = complianceData.warningResults.map((result) => result.url);
            const warningPlan = { ...plan, confirmedWarningUrls };
            setPendingConfirmation({ kind: "source_warning", reason: message, plan: warningPlan });
            setFetchPhase("confirming");
            return;
          }
        }
      } catch {
        // Fall through to server-side validation.
      }
    }

    await estimateFetchPlan({ ...plan, confirmedWarningUrls });
  }, [
    acquireLock,
    companyId,
    estimateFetchPlan,
    inputMode,
    parsedCustomUrls.invalidLines.length,
    parsedCustomUrls.urls,
    releaseToIdle,
    resolvedFetchContentType,
    webDraft.candidates,
    webDraft.selectedUrls,
    setError,
  ]);

  const handleConfirmFetch = useCallback(async () => {
    const confirmation = pendingConfirmation;
    if (!confirmation) return;
    setPendingConfirmation(null);
    if (confirmation.kind === "source_warning") {
      await estimateFetchPlan(confirmation.plan);
      return;
    }
    await executeFetchPlan(confirmation.plan);
  }, [estimateFetchPlan, executeFetchPlan, pendingConfirmation]);

  const handleCancelFetch = useCallback(() => {
    releaseToIdle();
  }, [releaseToIdle]);

  return {
    fetchPhase,
    pendingConfirmation,
    handleFetchCorporateInfo,
    handleConfirmFetch,
    handleCancelFetch,
  };
}
