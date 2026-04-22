"use client";

import { useCallback, useState } from "react";

import { parseApiErrorResponse } from "@/lib/api-errors";
import { reportUserFacingError } from "@/lib/client-error-ui";
import {
  generateMotivationDraft,
  generateMotivationDraftDirect,
  saveMotivationDraft,
} from "@/lib/motivation/client-api";

export function useMotivationDraft({
  companyId,
  acquireLock,
  releaseLock,
  activeOperationLabel,
  setError,
  setConversationLoadError,
  fetchData,
  canGenerateDraftDirect,
  getDraftDirectPayload,
}: {
  companyId: string;
  acquireLock: (label: string) => boolean;
  releaseLock: () => void;
  activeOperationLabel: string | null;
  setError: (value: string | null) => void;
  setConversationLoadError: (value: string | null) => void;
  fetchData: () => Promise<void>;
  canGenerateDraftDirect: () => boolean;
  getDraftDirectPayload: () => {
    charLimit: 300 | 400 | 500;
    selectedIndustry: string | null;
    selectedRole: string;
    roleSelectionSource: string | null;
  } | null;
}) {
  const [generatedDraft, setGeneratedDraft] = useState<string | null>(null);
  const [generatedDocumentId, setGeneratedDocumentId] = useState<string | null>(null);
  const [isGeneratingDraft, setIsGeneratingDraft] = useState(false);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [charLimit, setCharLimit] = useState<300 | 400 | 500>(400);

  const applyDraftPayload = useCallback((draft: string | null | undefined, documentId?: string | null) => {
    setGeneratedDraft(draft || null);
    setGeneratedDocumentId(documentId ?? null);
  }, []);

  const resetDraftState = useCallback(() => {
    setGeneratedDraft(null);
    setGeneratedDocumentId(null);
  }, []);

  const handleGenerateDraftDirect = useCallback(async () => {
    if (!canGenerateDraftDirect()) return;

    const payload = getDraftDirectPayload();
    if (!payload) {
      setError("先に業界と職種の設定を完了してください");
      return;
    }

    if (!acquireLock("志望動機を生成中")) {
      setError(`${activeOperationLabel || "別の操作"}が進行中です。完了までお待ちください。`);
      return;
    }

    setIsGeneratingDraft(true);
    setError(null);
    setConversationLoadError(null);

    try {
      const response = await generateMotivationDraftDirect(companyId, payload);

      if (!response.ok) {
        throw await parseApiErrorResponse(
          response,
          {
            code: "MOTIVATION_DRAFT_DIRECT_FAILED",
            userMessage: "会話なし下書きの生成に失敗しました。",
            action: "時間を置いて、もう一度お試しください。",
            retryable: true,
          },
          "MotivationPage.handleGenerateDraftDirect",
        );
      }

      await response.json().catch(() => null);
      setGeneratedDocumentId(null);
      await fetchData();
    } catch (err) {
      setError(
        reportUserFacingError(
          err,
          {
            code: "MOTIVATION_DRAFT_DIRECT_FAILED",
            userMessage: "会話なし下書きの生成に失敗しました。",
            action: "時間を置いて、もう一度お試しください。",
            retryable: true,
          },
          "MotivationPage.handleGenerateDraftDirect",
        ),
      );
    } finally {
      setIsGeneratingDraft(false);
      releaseLock();
    }
  }, [
    acquireLock,
    activeOperationLabel,
    canGenerateDraftDirect,
    companyId,
    fetchData,
    getDraftDirectPayload,
    releaseLock,
    setConversationLoadError,
    setError,
  ]);

  const handleGenerateDraft = useCallback(
    async ({ canGenerate }: { canGenerate: boolean }) => {
      if (isGeneratingDraft || !canGenerate) return;
      if (!acquireLock("志望動機を生成中")) return;

      setIsGeneratingDraft(true);
      setError(null);

      try {
        const response = await generateMotivationDraft(companyId, { charLimit });

        if (!response.ok) {
          throw await parseApiErrorResponse(
            response,
            {
              code: "MOTIVATION_DRAFT_GENERATE_FAILED",
              userMessage: "ES生成に失敗しました。",
              action: "時間を置いて、もう一度お試しください。",
              retryable: true,
            },
            "MotivationPage.handleGenerateDraft",
          );
        }

        const data = await response.json();
        setGeneratedDraft(data.draft);
        setGeneratedDocumentId(typeof data.documentId === "string" ? data.documentId : null);
        await fetchData();
      } catch (err) {
        setError(
          reportUserFacingError(
            err,
            {
              code: "MOTIVATION_DRAFT_GENERATE_FAILED",
              userMessage: "ES生成に失敗しました。",
              action: "時間を置いて、もう一度お試しください。",
              retryable: true,
            },
            "MotivationPage.handleGenerateDraft",
          ),
        );
      } finally {
        setIsGeneratingDraft(false);
        releaseLock();
      }
    },
    [acquireLock, charLimit, companyId, fetchData, isGeneratingDraft, releaseLock, setError],
  );

  const handleSaveGeneratedDraft = useCallback(async () => {
    if (!generatedDraft || generatedDocumentId || isSavingDraft || isGeneratingDraft) return;

    if (!acquireLock("下書きを保存中")) {
      setError(`${activeOperationLabel || "別の操作"}が進行中です。完了までお待ちください。`);
      return;
    }

    setIsSavingDraft(true);
    setError(null);

    try {
      const response = await saveMotivationDraft(companyId);
      if (!response.ok) {
        throw await parseApiErrorResponse(
          response,
          {
            code: "MOTIVATION_DRAFT_SAVE_FAILED",
            userMessage: "下書きを保存できませんでした。",
            action: "時間を置いて、もう一度お試しください。",
            retryable: true,
          },
          "MotivationPage.handleSaveGeneratedDraft",
        );
      }

      const data = await response.json();
      setGeneratedDocumentId(typeof data.documentId === "string" ? data.documentId : null);
    } catch (err) {
      setError(
        reportUserFacingError(
          err,
          {
            code: "MOTIVATION_DRAFT_SAVE_FAILED",
            userMessage: "下書きを保存できませんでした。",
            action: "時間を置いて、もう一度お試しください。",
            retryable: true,
          },
          "MotivationPage.handleSaveGeneratedDraft",
        ),
      );
    } finally {
      setIsSavingDraft(false);
      releaseLock();
    }
  }, [
    acquireLock,
    activeOperationLabel,
    companyId,
    generatedDocumentId,
    generatedDraft,
    isGeneratingDraft,
    isSavingDraft,
    releaseLock,
    setError,
  ]);

  return {
    generatedDraft,
    generatedDocumentId,
    isGeneratingDraft,
    isSavingDraft,
    charLimit,
    setGeneratedDraft,
    setGeneratedDocumentId,
    setCharLimit,
    applyDraftPayload,
    resetDraftState,
    handleGenerateDraftDirect,
    handleGenerateDraft,
    handleSaveGeneratedDraft,
  };
}
