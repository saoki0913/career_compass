"use client";

import { useCallback, useState } from "react";

import { parseApiErrorResponse } from "@/lib/api-errors";
import { reportUserFacingError } from "@/lib/client-error-ui";
import { generateMotivationFeedbackSummary } from "@/lib/motivation/client-api";
import {
  parseMotivationFeedbackSummary,
  type MotivationFeedbackSummary,
} from "@/lib/motivation/feedback-summary";

const FEEDBACK_ERROR_FALLBACK = {
  code: "MOTIVATION_FEEDBACK_SUMMARY_FAILED",
  userMessage: "フィードバックの生成に失敗しました。",
  action: "時間を置いて、もう一度お試しください。",
  retryable: true,
} as const;

/**
 * 志望動機フィードバックサマリ（面接で話す要点整理）の生成 hook。
 * 会話 state を書き換えない読み取り的アクションのため OperationLock には依存せず、
 * isSummaryLoading の自前ガードで二重実行を防ぐ。
 */
export function useMotivationFeedbackSummary({ companyId }: { companyId: string }) {
  const [summary, setSummary] = useState<MotivationFeedbackSummary | null>(null);
  const [isSummaryLoading, setIsSummaryLoading] = useState(false);
  const [summaryRequested, setSummaryRequested] = useState(false);

  const handleGenerateMotivationSummary = useCallback(async () => {
    if (isSummaryLoading) return;
    setIsSummaryLoading(true);
    setSummaryRequested(true);

    try {
      const response = await generateMotivationFeedbackSummary(companyId);
      if (!response.ok) {
        throw await parseApiErrorResponse(
          response,
          FEEDBACK_ERROR_FALLBACK,
          "MotivationPage.handleGenerateMotivationSummary",
        );
      }
      const data = await response.json().catch(() => null);
      setSummary(parseMotivationFeedbackSummary(data?.summary));
    } catch (err) {
      reportUserFacingError(
        err,
        FEEDBACK_ERROR_FALLBACK,
        "MotivationPage.handleGenerateMotivationSummary",
      );
    } finally {
      setIsSummaryLoading(false);
    }
  }, [companyId, isSummaryLoading]);

  return { summary, isSummaryLoading, summaryRequested, handleGenerateMotivationSummary };
}
