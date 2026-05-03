"use client";

import { useCallback, useState } from "react";

import { parseApiErrorResponse } from "@/lib/api-errors";
import { reportUserFacingError } from "@/lib/client-error-ui";
import {
  generateMotivationDraft,
  generateMotivationDraftDirect,
  resumeMotivationDeepDive,
  saveMotivationDraft,
} from "@/features/motivation/application/client-api";
import type {
  MotivationMessage,
  RoleOptionsResponse,
  RoleSelectionSource,
  MotivationSetupSnapshot,
} from "@/features/motivation/domain/ui";
import type { MotivationConversationPayload } from "@/lib/motivation/conversation-payload";
import {
  notifyError,
  notifyInfo,
  notifyMotivationDraftGenerated,
  notifyMotivationDraftSaved,
} from "@/lib/notifications";

type ConversationPayload = Partial<
  Omit<
    MotivationConversationPayload,
    "questionStage" | "conversationMode" | "currentSlot" | "conversationContext" | "setup"
  >
> & Record<string, unknown>;

export interface PostDraftDeps {
  companyId: string;
  messages: MotivationMessage[];
  questionCount: number;
  isDraftReady: boolean;
  isSending: boolean;
  isStartingConversation: boolean;
  isLocked: boolean;
  activeOperationLabel: string | null;
  selectedIndustry: string;
  selectedRoleName: string;
  roleSelectionSource: RoleSelectionSource | null;
  roleOptionsData: RoleOptionsResponse | null;
  setupSnapshot: MotivationSetupSnapshot | null;
  acquireLock: (label: string) => boolean;
  releaseLock: () => void;
  applyConversationPayload: (payload: ConversationPayload, roleOptions: RoleOptionsResponse | null) => void;
  fetchData: () => Promise<void>;
}

export function useMotivationPostDraftState(deps: PostDraftDeps) {
  const [generatedDraft, setGeneratedDraft] = useState<string | null>(null);
  const [generatedDocumentId, setGeneratedDocumentId] = useState<string | null>(null);
  const [isGeneratingDraft, setIsGeneratingDraft] = useState(false);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [isDraftModalOpen, setIsDraftModalOpen] = useState(false);
  const [charLimit, setCharLimit] = useState<300 | 400 | 500>(400);

  const handleGenerateDraft = useCallback(async () => {
    if (
      isGeneratingDraft ||
      (!generatedDraft && deps.messages.length === 0) ||
      !deps.isDraftReady ||
      deps.isStartingConversation
    ) return;
    if (!deps.acquireLock("志望動機を生成中")) return;

    setIsGeneratingDraft(true);

    try {
      const shouldUseDirectRegeneration = Boolean(generatedDraft) && deps.messages.length === 0;
      let response: Response;
      if (shouldUseDirectRegeneration) {
        const trimmedRole = deps.selectedRoleName.trim();
        const requiresIndustrySelection = Boolean(deps.roleOptionsData?.requiresIndustrySelection);
        const resolvedIndustry =
          deps.selectedIndustry || deps.roleOptionsData?.industry || deps.setupSnapshot?.resolvedIndustry || "";

        if (!trimmedRole || (requiresIndustrySelection && !resolvedIndustry)) {
          notifyError({ title: "先に業界と職種の設定を完了してください" });
          return;
        }

        response = await generateMotivationDraftDirect(deps.companyId, {
          charLimit,
          selectedIndustry: requiresIndustrySelection ? resolvedIndustry : null,
          selectedRole: trimmedRole,
          roleSelectionSource:
            deps.roleSelectionSource === "custom" ? "user_free_text" : deps.roleSelectionSource,
        });
      } else {
        response = await generateMotivationDraft(deps.companyId, { charLimit });
      }

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
      const documentId = typeof data.documentId === "string" ? data.documentId : null;
      setGeneratedDocumentId(documentId);

      deps.applyConversationPayload({
        messages: data.messages || deps.messages,
        nextQuestion: data.nextQuestion ?? null,
        questionCount: deps.questionCount,
        isDraftReady: true,
        generatedDraft: data.draft,
        draftDocumentId: documentId,
        ...(data.evidenceSummary != null && { evidenceSummary: data.evidenceSummary }),
        ...(data.evidenceCards != null && { evidenceCards: data.evidenceCards }),
        ...(data.userEvidenceCards != null && { userEvidenceCards: data.userEvidenceCards }),
        ...(data.questionStage != null && { questionStage: data.questionStage }),
        ...(data.stageStatus != null && { stageStatus: data.stageStatus }),
        ...(data.coachingFocus != null && { coachingFocus: data.coachingFocus }),
        ...(data.conversationMode != null && { conversationMode: data.conversationMode }),
        ...(data.currentSlot != null && { currentSlot: data.currentSlot }),
        ...(data.currentIntent != null && { currentIntent: data.currentIntent }),
        ...(data.nextAdvanceCondition != null && { nextAdvanceCondition: data.nextAdvanceCondition }),
        ...(data.progress != null && { progress: data.progress }),
        ...(data.causalGaps != null && { causalGaps: data.causalGaps }),
      }, deps.roleOptionsData);

      notifyMotivationDraftGenerated();
      setIsDraftModalOpen(true);
    } catch (err) {
      reportUserFacingError(
        err,
        {
          code: "MOTIVATION_DRAFT_GENERATE_FAILED",
          userMessage: "ES生成に失敗しました。",
          action: "時間を置いて、もう一度お試しください。",
          retryable: true,
        },
        "MotivationPage.handleGenerateDraft",
      );
    } finally {
      setIsGeneratingDraft(false);
      deps.releaseLock();
    }
  }, [isGeneratingDraft, generatedDraft, deps, charLimit]);

  const handleGenerateDraftDirect = useCallback(async () => {
    if (isGeneratingDraft || deps.isStartingConversation || deps.isSending || deps.isLocked) return;

    const trimmedRole = deps.selectedRoleName.trim();
    const requiresIndustrySelection = Boolean(deps.roleOptionsData?.requiresIndustrySelection);
    const resolvedIndustry =
      deps.selectedIndustry || deps.roleOptionsData?.industry || deps.setupSnapshot?.resolvedIndustry || "";

    if (!trimmedRole || (requiresIndustrySelection && !resolvedIndustry)) {
      notifyError({ title: "先に業界と職種の設定を完了してください" });
      return;
    }

    if (!deps.acquireLock("志望動機を生成中")) {
      notifyInfo({ title: `${deps.activeOperationLabel || "別の操作"}が進行中です。完了までお待ちください。` });
      return;
    }

    setIsGeneratingDraft(true);

    try {
      const response = await generateMotivationDraftDirect(deps.companyId, {
        charLimit,
        selectedIndustry: requiresIndustrySelection ? resolvedIndustry : null,
        selectedRole: trimmedRole,
        roleSelectionSource:
          deps.roleSelectionSource === "custom" ? "user_free_text" : deps.roleSelectionSource,
      });

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

      const data = await response.json().catch(() => null);
      const documentId = typeof data?.documentId === "string" ? data.documentId : null;
      setGeneratedDocumentId(documentId);

      if (data) {
        deps.applyConversationPayload({
          messages: data.messages ?? [],
          nextQuestion: data.nextQuestion ?? null,
          questionCount: data.questionCount ?? 0,
          isDraftReady: true,
          generatedDraft: data.draft ?? null,
          draftDocumentId: documentId,
          ...(data.evidenceSummary != null && { evidenceSummary: data.evidenceSummary }),
          ...(data.evidenceCards != null && { evidenceCards: data.evidenceCards }),
          ...(data.userEvidenceCards != null && { userEvidenceCards: data.userEvidenceCards }),
          ...(data.questionStage != null && { questionStage: data.questionStage }),
          ...(data.stageStatus != null && { stageStatus: data.stageStatus }),
          ...(data.coachingFocus != null && { coachingFocus: data.coachingFocus }),
          ...(data.conversationMode != null && { conversationMode: data.conversationMode }),
          ...(data.currentSlot != null && { currentSlot: data.currentSlot }),
          ...(data.currentIntent != null && { currentIntent: data.currentIntent }),
          ...(data.nextAdvanceCondition != null && { nextAdvanceCondition: data.nextAdvanceCondition }),
          ...(data.progress != null && { progress: data.progress }),
          ...(data.causalGaps != null && { causalGaps: data.causalGaps }),
        }, deps.roleOptionsData);
      } else {
        await deps.fetchData();
      }
    } catch (err) {
      reportUserFacingError(
        err,
        {
          code: "MOTIVATION_DRAFT_DIRECT_FAILED",
          userMessage: "会話なし下書きの生成に失敗しました。",
          action: "時間を置いて、もう一度お試しください。",
          retryable: true,
        },
        "MotivationPage.handleGenerateDraftDirect",
      );
    } finally {
      setIsGeneratingDraft(false);
      deps.releaseLock();
    }
  }, [isGeneratingDraft, deps, charLimit]);

  const handleSaveGeneratedDraft = useCallback(async (): Promise<string | null> => {
    if (!generatedDraft || generatedDocumentId || isSavingDraft || isGeneratingDraft || deps.isLocked) return null;

    if (!deps.acquireLock("下書きを保存中")) {
      notifyInfo({ title: `${deps.activeOperationLabel || "別の操作"}が進行中です。完了までお待ちください。` });
      return null;
    }

    setIsSavingDraft(true);

    try {
      const response = await saveMotivationDraft(deps.companyId);
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
      const docId = typeof data.documentId === "string" ? data.documentId : null;
      setGeneratedDocumentId(docId);
      notifyMotivationDraftSaved();
      return docId;
    } catch (err) {
      reportUserFacingError(
        err,
        {
          code: "MOTIVATION_DRAFT_SAVE_FAILED",
          userMessage: "下書きを保存できませんでした。",
          action: "時間を置いて、もう一度お試しください。",
          retryable: true,
        },
        "MotivationPage.handleSaveGeneratedDraft",
      );
      return null;
    } finally {
      setIsSavingDraft(false);
      deps.releaseLock();
    }
  }, [generatedDraft, generatedDocumentId, isSavingDraft, isGeneratingDraft, deps]);

  const handleResumeDeepDive = useCallback(async () => {
    if ((!generatedDraft && !deps.isDraftReady) || deps.isLocked) return;
    if (!deps.acquireLock("深掘り質問を取得中")) return;

    try {
      const response = await resumeMotivationDeepDive(deps.companyId);
      if (!response.ok) {
        throw await parseApiErrorResponse(
          response,
          {
            code: "MOTIVATION_RESUME_DEEPDIVE_FAILED",
            userMessage: "深掘り質問の取得に失敗しました。",
            action: "時間を置いて、もう一度お試しください。",
            retryable: true,
          },
          "MotivationPage.handleResumeDeepDive",
        );
      }

      const data = await response.json();
      setGeneratedDocumentId(null);
      deps.applyConversationPayload(data, deps.roleOptionsData);
    } catch (err) {
      reportUserFacingError(
        err,
        {
          code: "MOTIVATION_RESUME_DEEPDIVE_FAILED",
          userMessage: "深掘り質問の取得に失敗しました。",
          action: "時間を置いて、もう一度お試しください。",
          retryable: true,
        },
        "MotivationPage.handleResumeDeepDive",
      );
    } finally {
      deps.releaseLock();
    }
  }, [generatedDraft, deps]);

  const handleCloseDraftModal = useCallback(() => {
    setIsDraftModalOpen(false);
  }, []);

  return {
    generatedDraft,
    setGeneratedDraft,
    generatedDocumentId,
    setGeneratedDocumentId,
    isGeneratingDraft,
    isSavingDraft,
    isDraftModalOpen,
    setIsDraftModalOpen,
    charLimit,
    setCharLimit,
    handleGenerateDraft,
    handleGenerateDraftDirect,
    handleSaveGeneratedDraft,
    handleResumeDeepDive,
    handleCloseDraftModal,
  };
}
