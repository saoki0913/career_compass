"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { parseApiErrorResponse } from "@/lib/api-errors";
import { reportUserFacingError } from "@/lib/client-error-ui";
import {
  fetchMotivationCompany,
  fetchMotivationConversation,
  resetMotivationConversation,
  startMotivationConversation,
  streamMotivationConversation,
} from "@/lib/motivation/client-api";
import { appendOptimisticUserMessage, rollbackOptimisticMessageById } from "@/hooks/conversation/optimistic-message";
import type { MotivationCompany } from "@/lib/motivation/ui";

import type { PendingCompleteData } from "./types";

export function useMotivationTransport({
  companyId,
  acquireLock,
  releaseLock,
  activeOperationLabel,
  isLocked,
  setup,
  domain,
  draft,
  playback,
  answer,
  setAnswer,
  setError,
  isGeneratingDraft,
}: {
  companyId: string;
  acquireLock: (label: string) => boolean;
  releaseLock: () => void;
  activeOperationLabel: string | null;
  isLocked: boolean;
  setup: {
    roleOptionsData: any;
    setupSnapshot: any;
    selectedIndustry: string;
    selectedRoleName: string;
    roleSelectionSource: any;
    fetchRoleOptions: (industryOverride?: string | null) => Promise<any>;
  };
  domain: {
    messages: any[];
    isDraftReady: boolean;
    conversationLoadError: string | null;
    applyConversationPayload: (conversation: any, roleOptions: any) => void;
    applyPendingCompleteData: (data: PendingCompleteData) => void;
    resetConversationState: () => void;
    setMessages: (value: any) => void;
    setNextQuestion: (value: string | null) => void;
    setQuestionCount: (value: number) => void;
    setIsDraftReady: (value: boolean) => void;
    setEvidenceSummary: (value: string | null) => void;
    setEvidenceCards: (value: any[]) => void;
    setQuestionStage: (value: any) => void;
    setStageStatus: (value: any) => void;
    setCoachingFocus: (value: string | null) => void;
    setConversationMode: (value: any) => void;
    setCurrentSlot: (value: any) => void;
    setCurrentIntent: (value: string | null) => void;
    setNextAdvanceCondition: (value: string | null) => void;
    setProgress: (value: any) => void;
    setCausalGaps: (value: any[]) => void;
    setConversationLoadError: (value: string | null) => void;
    withIds: (messages: any[]) => any[];
  };
  draft: {
    applyDraftPayload: (draft: string | null | undefined, documentId?: string | null) => void;
    resetDraftState: () => void;
  };
  playback: {
    setPendingCompleteData: (value: PendingCompleteData | null) => void;
    setStreamingTargetText: (value: string) => void;
    setIsTextStreaming: (value: boolean) => void;
    setStreamingSessionId: (value: number | ((prev: number) => number)) => void;
    isTextStreaming: boolean;
  };
  answer: string;
  setAnswer: (value: string) => void;
  setError: (value: string | null) => void;
  isGeneratingDraft: boolean;
}) {
  const [company, setCompany] = useState<MotivationCompany | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [isWaitingForResponse, setIsWaitingForResponse] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [streamingLabel, setStreamingLabel] = useState<string | null>(null);
  const [isStartingConversationState, setIsStartingConversationState] = useState(false);

  const fetchDataRequestIdRef = useRef(0);

  const fetchData = useCallback(async () => {
    const requestId = ++fetchDataRequestIdRef.current;
    setError(null);
    domain.setConversationLoadError(null);

    try {
      const [companyRes, conversationRes] = await Promise.all([
        fetchMotivationCompany(companyId),
        fetchMotivationConversation(companyId),
      ]);

      if (!companyRes.ok) {
        throw await parseApiErrorResponse(
          companyRes,
          {
            code: "MOTIVATION_COMPANY_FETCH_FAILED",
            userMessage: "企業情報の取得に失敗しました。",
            action: "ページを再読み込みして、もう一度お試しください。",
            retryable: true,
          },
          "MotivationPage.fetchData.company",
        );
      }

      const companyData = await companyRes.json();
      if (requestId !== fetchDataRequestIdRef.current) {
        return;
      }
      setCompany(companyData.company);

      const conversationData = conversationRes.ok ? await conversationRes.json() : null;
      const setupIndustry =
        conversationData?.setup?.selectedIndustry ||
        conversationData?.setup?.resolvedIndustry ||
        conversationData?.conversationContext?.selectedIndustry ||
        companyData.company.industry ||
        null;
      const roleData = await setup.fetchRoleOptions(setupIndustry);
      if (requestId !== fetchDataRequestIdRef.current) {
        return;
      }

      if (conversationData) {
        domain.applyConversationPayload(conversationData, roleData);
        draft.applyDraftPayload(conversationData.generatedDraft ?? null, conversationData.documentId ?? null);
        return;
      }

      const errorData = await conversationRes.json().catch(() => null);
      const message =
        typeof errorData?.error === "string"
          ? errorData.error
          : "保存済みの会話は復元できませんでした。業界と職種を選び直して再開できます。";

      draft.resetDraftState();
      domain.applyConversationPayload(
        {
          messages: [],
          nextQuestion: null,
          questionCount: 0,
          isDraftReady: false,
          evidenceSummary: null,
          evidenceCards: [],
          generatedDraft: null,
          questionStage: null,
          stageStatus: null,
          coachingFocus: null,
          conversationMode: "slot_fill",
          currentSlot: null,
          currentIntent: null,
          nextAdvanceCondition: null,
          progress: null,
          causalGaps: [],
          conversationContext: {
            selectedIndustry: roleData?.industry || companyData.company.industry,
            selectedRole: null,
            selectedRoleSource: null,
          },
          setup: {
            selectedIndustry: roleData?.industry || companyData.company.industry,
            selectedRole: null,
            selectedRoleSource: null,
            requiresIndustrySelection: Boolean(roleData?.requiresIndustrySelection),
            resolvedIndustry: roleData?.industry || companyData.company.industry,
            isComplete: false,
            requiresRestart: false,
            hasSavedConversation: false,
          },
        },
        roleData,
      );
      domain.setConversationLoadError(message);
    } catch (err) {
      if (requestId !== fetchDataRequestIdRef.current) {
        return;
      }
      setError(
        reportUserFacingError(
          err,
          {
            code: "MOTIVATION_DATA_FETCH_FAILED",
            userMessage: "データの取得に失敗しました。",
            action: "ページを再読み込みして、もう一度お試しください。",
            retryable: true,
          },
          "MotivationPage.fetchData",
        ),
      );
    } finally {
      if (requestId === fetchDataRequestIdRef.current) {
        setIsLoading(false);
      }
    }
    // `domain` / `setup` は毎レンダーで新しいオブジェクト参照になるため、ここに列挙すると
    // useEffect([fetchData]) が毎回走り API を無限フェッチする。安定したコールバックだけに絞る。
  }, [
    companyId,
    setError,
    setup.fetchRoleOptions,
    domain.applyConversationPayload,
    domain.setConversationLoadError,
    draft.applyDraftPayload,
    draft.resetDraftState,
  ]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const handleStartConversation = useCallback(async () => {
    if (isStartingConversationState || isSending || isLocked) return;

    const trimmedRole = setup.selectedRoleName.trim();
    const requiresIndustrySelection = Boolean(setup.roleOptionsData?.requiresIndustrySelection);
    const resolvedIndustry =
      setup.selectedIndustry || setup.roleOptionsData?.industry || setup.setupSnapshot?.resolvedIndustry || "";

    if (!trimmedRole || (requiresIndustrySelection && !resolvedIndustry)) {
      setError("先に業界と職種の設定を完了してください");
      return;
    }

    if (!acquireLock("質問を準備中")) {
      setError(`${activeOperationLabel || "別の操作"}が進行中です。完了までお待ちください。`);
      return;
    }

    setIsStartingConversationState(true);
    setError(null);
    domain.setConversationLoadError(null);

    try {
      const response = await startMotivationConversation(companyId, {
        selectedIndustry: requiresIndustrySelection ? resolvedIndustry : null,
        selectedRole: trimmedRole,
        roleSelectionSource:
          setup.roleSelectionSource === "custom" ? "user_free_text" : setup.roleSelectionSource,
      });

      if (!response.ok) {
        throw await parseApiErrorResponse(
          response,
          {
            code: "MOTIVATION_CONVERSATION_START_FAILED",
            userMessage: "会話の開始に失敗しました。",
            action: "入力内容を確認して、もう一度お試しください。",
            retryable: true,
          },
          "MotivationPage.handleStartConversation",
        );
      }

      const data = await response.json();
      domain.applyConversationPayload(data, setup.roleOptionsData);
    } catch (err) {
      setError(
        reportUserFacingError(
          err,
          {
            code: "MOTIVATION_CONVERSATION_START_FAILED",
            userMessage: "会話の開始に失敗しました。",
            action: "入力内容を確認して、もう一度お試しください。",
            retryable: true,
          },
          "MotivationPage.handleStartConversation",
        ),
      );
    } finally {
      setIsStartingConversationState(false);
      releaseLock();
    }
  }, [
    acquireLock,
    activeOperationLabel,
    companyId,
    domain,
    isLocked,
    isSending,
    releaseLock,
    setError,
    setup,
  ]);

  const handleSend = useCallback(async () => {
    const textToSend = answer.trim();
    if (!textToSend || isSending) return;
    if (!acquireLock("AIに送信中")) {
      setError(`${activeOperationLabel || "別の操作"}が進行中です。完了までお待ちください。`);
      return;
    }

    const optimisticUpdate = appendOptimisticUserMessage(domain.messages, "optimistic", (optimisticId) => ({
      id: optimisticId,
      role: "user",
      content: textToSend,
      isOptimistic: true,
    }));
    const optimisticId = optimisticUpdate.optimisticId;

    domain.setMessages(optimisticUpdate.messages);
    setAnswer("");
    setIsSending(true);
    setIsWaitingForResponse(true);
    setError(null);
    playback.setPendingCompleteData(null);
    playback.setStreamingTargetText("");
    playback.setIsTextStreaming(false);
    playback.setStreamingSessionId((prev) => prev + 1);
    setStreamingLabel(null);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 90_000);
    let startedQuestionPlayback = false;

    try {
      const response = await streamMotivationConversation(companyId, { answer: textToSend }, controller.signal);

      if (!response.ok) {
        throw await parseApiErrorResponse(
          response,
          {
            code: "MOTIVATION_CONVERSATION_STREAM_FAILED",
            userMessage: "送信に失敗しました。",
            action: "時間を置いて、もう一度お試しください。",
            retryable: true,
          },
          "MotivationPage.handleSend",
        );
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error("ストリームが取得できませんでした");
      }

      const decoder = new TextDecoder();
      let buffer = "";
      let completed = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const jsonStr = line.slice(6).trim();
          if (!jsonStr) continue;

          let event;
          try {
            event = JSON.parse(jsonStr);
          } catch {
            continue;
          }

          if (event.type === "progress") {
            setStreamingLabel(event.label || null);
          } else if (event.type === "complete") {
            completed = true;
            const data = event.data;
            const nextData: PendingCompleteData = {
              messages: domain.withIds(data.messages || []),
              nextQuestion: data.nextQuestion,
              questionCount: data.questionCount || 0,
              isDraftReady: data.isDraftReady || false,
              draftReadyJustUnlocked: data.draftReadyJustUnlocked || false,
              evidenceSummary: data.evidenceSummary || null,
              evidenceCards: data.evidenceCards || [],
              questionStage: data.questionStage || null,
              stageStatus: data.stageStatus || null,
              coachingFocus: data.coachingFocus || null,
              conversationMode: data.conversationMode || "slot_fill",
              currentSlot: data.currentSlot || null,
              currentIntent: data.currentIntent || null,
              nextAdvanceCondition: data.nextAdvanceCondition || null,
              progress: data.progress || null,
              causalGaps: data.causalGaps || [],
            };
            const questionForPlayback = typeof nextData.nextQuestion === "string" ? nextData.nextQuestion.trim() : "";

            if (startedQuestionPlayback) {
              if (questionForPlayback) {
                playback.setStreamingTargetText(questionForPlayback);
              }
              playback.setPendingCompleteData(nextData);
            } else if (questionForPlayback) {
              playback.setStreamingTargetText(questionForPlayback);
              playback.setIsTextStreaming(true);
              setIsWaitingForResponse(false);
              playback.setPendingCompleteData(nextData);
              startedQuestionPlayback = true;
            } else {
              domain.applyPendingCompleteData(nextData);
            }
          } else if (event.type === "error") {
            throw new Error(event.message || "AIサービスでエラーが発生しました");
          }
        }
      }

      if (!completed) {
        throw new Error("ストリームが途中で切断されました");
      }
    } catch (err) {
      domain.setMessages((prev: any[]) => rollbackOptimisticMessageById(prev, optimisticId));
      playback.setPendingCompleteData(null);
      playback.setStreamingTargetText("");
      playback.setIsTextStreaming(false);
      if (err instanceof Error && err.name === "AbortError") {
        setError("AIの応答に時間がかかりすぎています。再度お試しください。");
      } else {
        setError(
          reportUserFacingError(
            err,
            {
              code: "MOTIVATION_CONVERSATION_STREAM_FAILED",
              userMessage: "送信に失敗しました。",
              action: "時間を置いて、もう一度お試しください。",
              retryable: true,
            },
            "MotivationPage.handleSend",
          ),
        );
      }
      await fetchData();
    } finally {
      clearTimeout(timeoutId);
      setIsSending(false);
      setIsWaitingForResponse(false);
      setStreamingLabel(null);
      if (!startedQuestionPlayback) {
        playback.setStreamingTargetText("");
        playback.setIsTextStreaming(false);
      }
      releaseLock();
    }
  }, [
    acquireLock,
    activeOperationLabel,
    answer,
    companyId,
    domain,
    draft,
    fetchData,
    isSending,
    playback,
    releaseLock,
    setAnswer,
    setError,
  ]);

  const handleResetConversation = useCallback(async () => {
    if (isSending || isGeneratingDraft || isResetting || isWaitingForResponse || playback.isTextStreaming || isStartingConversationState) {
      return;
    }

    if (!window.confirm("保存済みの志望動機会話を初期化して、会話をやり直します。よろしいですか？")) {
      return;
    }

    if (!acquireLock("会話を初期化中")) {
      setError(`${activeOperationLabel || "別の操作"}が進行中です。完了までお待ちください。`);
      return;
    }

    setIsResetting(true);
    setError(null);

    try {
      const response = await resetMotivationConversation(companyId);
      if (!response.ok) {
        throw await parseApiErrorResponse(
          response,
          {
            code: "MOTIVATION_CONVERSATION_RESET_FAILED",
            userMessage: "会話の初期化に失敗しました。",
            action: "時間を置いて、もう一度お試しください。",
            retryable: true,
          },
          "MotivationPage.handleResetConversation",
        );
      }

      draft.resetDraftState();
      domain.resetConversationState();
      playback.setPendingCompleteData(null);
      playback.setStreamingTargetText("");
      playback.setIsTextStreaming(false);
      playback.setStreamingSessionId((prev) => prev + 1);
      setAnswer("");
      await fetchData();
    } catch (err) {
      setError(
        reportUserFacingError(
          err,
          {
            code: "MOTIVATION_CONVERSATION_RESET_FAILED",
            userMessage: "会話の初期化に失敗しました。",
            action: "時間を置いて、もう一度お試しください。",
            retryable: true,
          },
          "MotivationPage.handleResetConversation",
        ),
      );
    } finally {
      setIsResetting(false);
      releaseLock();
    }
  }, [
    acquireLock,
    activeOperationLabel,
    companyId,
    domain,
    fetchData,
    isGeneratingDraft,
    isResetting,
    isSending,
    isStartingConversationState,
    isWaitingForResponse,
    playback,
    releaseLock,
    setAnswer,
    setError,
  ]);

  return {
    company,
    isLoading,
    isSending,
    isWaitingForResponse,
    isResetting,
    isStartingConversation: isStartingConversationState,
    streamingLabel,
    setStreamingLabel,
    fetchData,
    handleStartConversation,
    handleSend,
    handleResetConversation,
  };
}
