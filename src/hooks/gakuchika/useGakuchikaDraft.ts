"use client";

import { useCallback, useState } from "react";

import { parseApiErrorResponse } from "@/lib/api-errors";
import { reportUserFacingError } from "@/lib/client-error-ui";
import { generateGakuchikaEsDraft } from "@/lib/gakuchika/client-api";
import { isDraftReady } from "@/lib/gakuchika/conversation-state";

export function useGakuchikaDraft({
  gakuchikaId,
  onDraftGenerated,
  acquireLock,
  releaseLock,
  setError,
  getConversationState,
  getDraftCharLimit,
}: {
  gakuchikaId: string;
  onDraftGenerated: (documentId: string) => void;
  acquireLock: (label: string) => boolean;
  releaseLock: () => void;
  setError: (value: string | null) => void;
  getConversationState: () => any;
  getDraftCharLimit: () => 300 | 400 | 500;
}) {
  const [isGeneratingDraft, setIsGeneratingDraft] = useState(false);

  const generateDraft = useCallback(async () => {
    if (!isDraftReady(getConversationState()) || isGeneratingDraft) return;
    if (!acquireLock("ガクチカESを生成中")) return;

    setIsGeneratingDraft(true);
    setError(null);

    try {
      const response = await generateGakuchikaEsDraft(gakuchikaId, { charLimit: getDraftCharLimit() });

      if (!response.ok) {
        throw await parseApiErrorResponse(
          response,
          {
            code: "GAKUCHIKA_DRAFT_GENERATE_FAILED",
            userMessage: "ES生成に失敗しました。",
            action: "時間を置いて、もう一度お試しください。",
            retryable: true,
          },
          "GakuchikaPage.handleGenerateDraft",
        );
      }

      const data = await response.json();
      if (data.documentId) {
        onDraftGenerated(data.documentId);
      }
    } catch (err) {
      setError(
        reportUserFacingError(
          err,
          {
            code: "GAKUCHIKA_DRAFT_GENERATE_FAILED",
            userMessage: "ES生成に失敗しました。",
            action: "時間を置いて、もう一度お試しください。",
            retryable: true,
          },
          "GakuchikaPage.handleGenerateDraft",
        ),
      );
    } finally {
      setIsGeneratingDraft(false);
      releaseLock();
    }
  }, [acquireLock, gakuchikaId, getConversationState, getDraftCharLimit, isGeneratingDraft, onDraftGenerated, releaseLock, setError]);

  return {
    isGeneratingDraft,
    generateDraft,
  };
}
