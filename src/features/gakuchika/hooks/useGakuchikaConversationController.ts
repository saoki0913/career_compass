"use client";

import { startTransition, useCallback, useEffect, useMemo, useState } from "react";

import { useOperationLock } from "@/hooks/useOperationLock";
import { useConversationRuntime, useLockedOperation } from "@/hooks/conversation";
import { parseApiErrorResponse } from "@/lib/api-errors";
import { reportUserFacingError } from "@/lib/client-error-ui";
import { notifyGakuchikaDraftGenerated, notifyGakuchikaInterviewReady } from "@/lib/notifications";
import {
  discardGeneratedGakuchikaDraft,
  fetchGakuchikaConversation,
  fetchGakuchikaDetail,
  generateGakuchikaEsDraft,
  generateGakuchikaInterviewSummary,
  resumeGakuchikaConversation,
  startGakuchikaConversation,
} from "@/features/gakuchika/application/client-api";
import {
  getDefaultConversationState,
  getGakuchikaNextAction,
  hasDraftText,
  isDraftReady,
  isInterviewReady,
  type ConversationState,
} from "@/features/gakuchika/domain/conversation-state";
import { parseGakuchikaSummary } from "@/lib/gakuchika/summary";
import {
  normalizeGakuchikaMessages,
  PROCESSING_LABELS,
  parseGakuchikaCharLimitType,
  type AssistantProcessingPhase,
  type ConversationUpdate,
  type GakuchikaDraftCharLimit,
  type Session,
  type Message,
} from "@/features/gakuchika/domain/ui";
import { createGakuchikaStreamAdapter } from "./gakuchika-stream-adapter";

type GakuchikaSummary = ReturnType<typeof parseGakuchikaSummary>;

type GakuchikaDraftQuality = {
  status?: "passed" | "repaired" | "warning";
  warnings?: string[];
  retry_count?: number;
  retryCount?: number;
  failure_codes?: string[];
  selection_reason?: string;
  selectionReason?: string;
} | null;

type ControllerParams = {
  gakuchikaId: string;
};

export function useGakuchikaConversationController({
  gakuchikaId,
}: ControllerParams) {
  const { acquireLock, releaseLock } = useOperationLock();
  const { run: runLockedOperation } = useLockedOperation();

  const [messages, setMessages] = useState<Message[]>([]);
  const [nextQuestion, setNextQuestion] = useState<string | null>(null);
  const [questionCount, setQuestionCount] = useState(0);
  const [isCompleted, setIsCompleted] = useState(false);
  const [isInterviewReadyState, setIsInterviewReadyState] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [answer, setAnswer] = useState("");
  const [isAIPowered, setIsAIPowered] = useState(true);
  const [conversationState, setConversationState] = useState<ConversationState | null>(null);
  const [conversationStarted, setConversationStarted] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [isResumingSession, setIsResumingSession] = useState(false);
  const [gakuchikaTitle, setGakuchikaTitle] = useState("");
  const [gakuchikaContent, setGakuchikaContent] = useState<string | null>(null);
  const [showStarInfo, setShowStarInfo] = useState(false);
  const [summary, setSummary] = useState<GakuchikaSummary>(null);
  const [isSummaryLoading, setIsSummaryLoading] = useState(false);
  const [summaryRequested, setSummaryRequested] = useState(false);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [assistantPhase, setAssistantPhase] = useState<AssistantProcessingPhase>("idle");
  const [isBufferingQuestionChunks, setIsBufferingQuestionChunks] = useState(false);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [isGeneratingDraft, setIsGeneratingDraft] = useState(false);
  const [restartDialogOpen, setRestartDialogOpen] = useState(false);
  const [draftCharLimit, setDraftCharLimit] = useState<GakuchikaDraftCharLimit>(400);
  const [isDraftModalOpen, setIsDraftModalOpen] = useState(false);
  const [generatedDraftText, setGeneratedDraftText] = useState<string | null>(null);
  const [generatedDocumentId, setGeneratedDocumentId] = useState<string | null>(null);
  const [generatedDraftQuality, setGeneratedDraftQuality] = useState<GakuchikaDraftQuality>(null);

  const clearDraftModalState = useCallback(() => {
    setIsDraftModalOpen(false);
    setGeneratedDraftText(null);
    setGeneratedDocumentId(null);
    setGeneratedDraftQuality(null);
  }, []);

  const applyConversationUpdate = useCallback((update: ConversationUpdate) => {
    startTransition(() => {
      setMessages(update.messages);
      setNextQuestion(update.nextQuestion);
      setQuestionCount(update.questionCount);
      setIsCompleted(update.isCompleted);
      setIsInterviewReadyState(update.isInterviewReady);
      setIsAIPowered(update.isAIPowered);
      setConversationState(update.conversationState);

      if (update.isInterviewReady) {
        setSummary(null);
        setIsSummaryLoading(false);
        setSummaryRequested(false);
        notifyGakuchikaInterviewReady();
      } else if (!update.isCompleted) {
        setSummary(null);
        setIsSummaryLoading(false);
        setSummaryRequested(false);
      }
    });
  }, []);

  const adapter = useMemo(() => createGakuchikaStreamAdapter({
    gakuchikaId,
    currentSessionId,
    commitState: (state) => {
      applyConversationUpdate(state);
      setIsBufferingQuestionChunks(false);
      setAssistantPhase("idle");
    },
    onSideEffect: (context) => {
      setAssistantPhase(context.assistantPhase);
      setIsBufferingQuestionChunks(context.isBufferingQuestionChunks);
    },
    onError: (_err, originalAnswer) => {
      setAnswer(originalAnswer);
      setNextQuestion(null);
      setIsBufferingQuestionChunks(false);
      setAssistantPhase("idle");
    },
  }), [applyConversationUpdate, currentSessionId, gakuchikaId]);

  const {
    send: runtimeSend,
    isSending,
    isWaitingForResponse,
    streamingText,
    isTextStreaming,
  } = useConversationRuntime({
    adapter,
    messages,
    setMessages,
  });

  const fetchConversation = useCallback(async (sessionId?: string) => {
    try {
      const [conversationRes, gakuchikaRes] = await Promise.all([
        fetchGakuchikaConversation(gakuchikaId, sessionId),
        fetchGakuchikaDetail(gakuchikaId),
      ]);

      if (!conversationRes.ok) {
        const errorData = await conversationRes.json().catch(() => ({}));
        throw new Error(errorData.error || "会話の取得に失敗しました");
      }

      const conversationData = await conversationRes.json();

      if (conversationData.noConversation) {
        setConversationStarted(false);
        setGakuchikaTitle(conversationData.gakuchikaTitle || "");
        setGakuchikaContent(conversationData.gakuchikaContent || null);
        setSessions([]);
        setConversationState(getDefaultConversationState());
        setSummary(null);
        setIsSummaryLoading(false);
        setSummaryRequested(false);
      } else {
        setConversationStarted(true);
        setMessages(normalizeGakuchikaMessages(conversationData.messages));
        setNextQuestion(conversationData.nextQuestion);
        setQuestionCount(conversationData.questionCount || 0);
        setIsCompleted(conversationData.isCompleted || false);
        setIsInterviewReadyState(Boolean(conversationData.isInterviewReady));
        setIsAIPowered(conversationData.isAIPowered ?? true);
        const restoredState = conversationData.conversationState || getDefaultConversationState();
        setConversationState(restoredState);
        setSessions(conversationData.sessions || []);
        setCurrentSessionId(conversationData.conversation?.id || null);
        if (restoredState?.draftQuality) {
          setGeneratedDraftQuality(restoredState.draftQuality);
        }
      }

      if (gakuchikaRes.ok) {
        const gakuchikaData = await gakuchikaRes.json();
        setGakuchikaTitle(gakuchikaData.gakuchika?.title || "");
        setGakuchikaContent(gakuchikaData.gakuchika?.content || null);
        setDraftCharLimit(parseGakuchikaCharLimitType(gakuchikaData.gakuchika?.charLimitType));
        setSummary(null);
        setIsSummaryLoading(false);
        setSummaryRequested(false);
      }
    } catch (err) {
      reportUserFacingError(
        err,
        {
          code: "GAKUCHIKA_CONVERSATION_FETCH_FAILED",
          userMessage: "会話の取得に失敗しました。",
          action: "ページを再読み込みして、もう一度お試しください。",
          retryable: true,
        },
        "GakuchikaPage.fetchConversation",
      );
    } finally {
      setAssistantPhase("idle");
      setIsLoading(false);
    }
  }, [gakuchikaId]);

  useEffect(() => {
    void fetchConversation();
  }, [fetchConversation]);

  const retrySummary = useCallback(async () => {
    if (!currentSessionId) return;
    setSummaryRequested(true);
    setSummary(null);
    setIsSummaryLoading(true);
    try {
      const response = await generateGakuchikaInterviewSummary(gakuchikaId, {
        sessionId: currentSessionId,
      });
      if (!response.ok) {
        throw await parseApiErrorResponse(
          response,
          {
            code: "GAKUCHIKA_INTERVIEW_SUMMARY_FAILED",
            userMessage: "面接フィードバックの生成に失敗しました。",
            action: "時間を置いて、もう一度お試しください。",
            retryable: true,
          },
          "GakuchikaPage.handleGenerateInterviewSummary",
        );
      }
      const data = await response.json();
      const parsedSummary = parseGakuchikaSummary(data.summary ?? null);
      setSummary(parsedSummary);
      if (data.conversationState) {
        setConversationState(data.conversationState);
      }
    } catch (err) {
      reportUserFacingError(
        err,
        {
          code: "GAKUCHIKA_INTERVIEW_SUMMARY_FAILED",
          userMessage: "面接フィードバックの生成に失敗しました。",
          action: "時間を置いて、もう一度お試しください。",
          retryable: true,
        },
        "GakuchikaPage.handleGenerateInterviewSummary",
      );
    } finally {
      setIsSummaryLoading(false);
    }
  }, [currentSessionId, gakuchikaId]);

  const startDeepDive = useCallback(async () => {
    setIsStarting(true);
    clearDraftModalState();

    try {
      const response = await startGakuchikaConversation(gakuchikaId);

      if (!response.ok) {
        throw await parseApiErrorResponse(
          response,
          {
            code: "GAKUCHIKA_CONVERSATION_START_FAILED",
            userMessage: "作成の開始に失敗しました。",
            action: "時間を置いて、もう一度お試しください。",
            retryable: true,
          },
          "GakuchikaPage.handleStartDeepDive",
        );
      }

      const data = await response.json();
      setCurrentSessionId(data.conversation?.id || null);
      setConversationStarted(true);
      await fetchConversation(data.conversation?.id);
    } catch (err) {
      reportUserFacingError(
        err,
        {
          code: "GAKUCHIKA_CONVERSATION_START_FAILED",
          userMessage: "作成の開始に失敗しました。",
          action: "時間を置いて、もう一度お試しください。",
          retryable: true,
        },
        "GakuchikaPage.handleStartDeepDive",
      );
    } finally {
      setIsStarting(false);
    }
  }, [clearDraftModalState, fetchConversation, gakuchikaId]);

  const send = useCallback(async () => {
    const trimmedAnswer = answer.trim();
    if (!trimmedAnswer) return;
    setAnswer("");
    setAssistantPhase("organizing_intent");
    setNextQuestion(null);
    await runtimeSend(trimmedAnswer);
  }, [answer, runtimeSend]);

  const selectSession = useCallback(async (sessionId: string) => {
    setCurrentSessionId(sessionId);
    setIsLoading(true);
    clearDraftModalState();
    await fetchConversation(sessionId);
  }, [clearDraftModalState, fetchConversation]);

  const applySessionPayload = useCallback((data: {
    conversation?: { id?: string | null };
    messages?: unknown;
    nextQuestion?: string | null;
    questionCount?: number;
    isCompleted?: boolean;
    isInterviewReady?: boolean;
    conversationState?: ConversationState | null;
    sessions?: Session[];
    isAIPowered?: boolean;
  }) => {
    setConversationStarted(true);
    setCurrentSessionId(data.conversation?.id || null);
    setMessages(normalizeGakuchikaMessages(data.messages));
    setNextQuestion(data.nextQuestion || null);
    setQuestionCount(data.questionCount || 0);
    setIsCompleted(Boolean(data.isCompleted));
    setIsInterviewReadyState(Boolean(data.isInterviewReady));
    setConversationState(data.conversationState || getDefaultConversationState());
    setSessions(data.sessions || []);
    setIsAIPowered(data.isAIPowered ?? true);
  }, []);

  const resumeSession = useCallback(async () => {
    await runLockedOperation({
      label: "深掘りを再開中",
      execute: () => resumeGakuchikaConversation(gakuchikaId, {
        sessionId: currentSessionId,
      }),
      errorMeta: {
        code: "GAKUCHIKA_CONVERSATION_RESUME_FAILED",
        userMessage: "深掘りの再開に失敗しました。",
        action: "時間を置いて、もう一度お試しください。",
        retryable: true,
        logContext: "GakuchikaPage.handleResumeSession",
      },
      onStart: () => {
        clearDraftModalState();
        setIsResumingSession(true);
      },
      onSuccess: applySessionPayload,
      onFinally: () => setIsResumingSession(false),
    });
  }, [applySessionPayload, clearDraftModalState, currentSessionId, gakuchikaId, runLockedOperation]);

  const discardDraftAndResumeSession = useCallback(async () => {
    if (!acquireLock("ES下書きを削除して深掘りを再開中")) return;
    const documentId = generatedDocumentId || conversationState?.draftDocumentId || null;
    setIsResumingSession(true);
    try {
      if (documentId) {
        const discardResponse = await discardGeneratedGakuchikaDraft(gakuchikaId, {
          sessionId: currentSessionId,
          documentId,
        });
        if (!discardResponse.ok) {
          throw await parseApiErrorResponse(
            discardResponse,
            {
              code: "GAKUCHIKA_DRAFT_DISCARD_FAILED",
              userMessage: "ES下書きの削除に失敗しました。",
              action: "時間を置いて、もう一度お試しください。",
              retryable: true,
            },
            "GakuchikaPage.handleDiscardDraftAndResumeSession",
          );
        }
      }
      clearDraftModalState();
      const response = await resumeGakuchikaConversation(gakuchikaId, {
        sessionId: currentSessionId,
      });
      if (!response.ok) {
        throw await parseApiErrorResponse(
          response,
          {
            code: "GAKUCHIKA_CONVERSATION_RESUME_FAILED",
            userMessage: "深掘りの再開に失敗しました。",
            action: "時間を置いて、もう一度お試しください。",
            retryable: true,
          },
          "GakuchikaPage.handleDiscardDraftAndResumeSession",
        );
      }
      applySessionPayload(await response.json());
    } catch (err) {
      reportUserFacingError(
        err,
        {
          code: "GAKUCHIKA_DRAFT_DISCARD_RESUME_FAILED",
          userMessage: "深掘りの再開に失敗しました。",
          action: "時間を置いて、もう一度お試しください。",
          retryable: true,
        },
        "GakuchikaPage.handleDiscardDraftAndResumeSession",
      );
    } finally {
      setIsResumingSession(false);
      releaseLock();
    }
  }, [
    acquireLock,
    applySessionPayload,
    clearDraftModalState,
    conversationState?.draftDocumentId,
    currentSessionId,
    gakuchikaId,
    generatedDocumentId,
    releaseLock,
  ]);

  const generateDraft = useCallback(async () => {
    if (!isDraftReady(conversationState) || isGeneratingDraft) return;
    if (!acquireLock("ガクチカESを生成中")) return;

    setIsGeneratingDraft(true);

    try {
      const response = await generateGakuchikaEsDraft(gakuchikaId, {
        charLimit: draftCharLimit,
        sessionId: currentSessionId,
      });

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
      setGeneratedDraftText(data.draft ?? null);
      setGeneratedDocumentId(data.documentId ?? null);
      setGeneratedDraftQuality(data.draftQuality ?? null);
      notifyGakuchikaDraftGenerated();
      setIsDraftModalOpen(true);
      await fetchConversation(currentSessionId || undefined);
    } catch (err) {
      reportUserFacingError(
        err,
        {
          code: "GAKUCHIKA_DRAFT_GENERATE_FAILED",
          userMessage: "ES生成に失敗しました。",
          action: "時間を置いて、もう一度お試しください。",
          retryable: true,
        },
        "GakuchikaPage.handleGenerateDraft",
      );
    } finally {
      setIsGeneratingDraft(false);
      releaseLock();
    }
  }, [acquireLock, conversationState, currentSessionId, draftCharLimit, fetchConversation, gakuchikaId, isGeneratingDraft, releaseLock]);

  const restartConversation = useCallback(() => {
    if (isStarting || isSending || isGeneratingDraft) return;
    setRestartDialogOpen(true);
  }, [isGeneratingDraft, isSending, isStarting]);

  const confirmRestartConversation = useCallback(async () => {
    if (isStarting || isSending || isGeneratingDraft) return;
    clearDraftModalState();
    await startDeepDive();
    setRestartDialogOpen(false);
  }, [clearDraftModalState, isGeneratingDraft, isSending, isStarting, startDeepDive]);

  const processingText =
    assistantPhase === "organizing_intent" || assistantPhase === "generating_question"
      ? PROCESSING_LABELS[assistantPhase]
      : null;

  const draftReady = isDraftReady(conversationState);
  const interviewReady = isInterviewReady(conversationState) || isInterviewReadyState;
  const generatedDraft = hasDraftText(conversationState);
  const nextAction = getGakuchikaNextAction(conversationState);
  const shouldPauseConversation = nextAction !== "ask";
  const gakuchikaDraftHelperText = interviewReady
    ? "面接で使う補足まで整理済みです。必要なら一覧やESへ戻れます。"
    : generatedDraft
      ? "ES を起点に、この画面から更に深掘りできます。モーダルから深掘りすると現在のES下書きは削除されます。"
      : draftReady
        ? "ガクチカESを作成できます。追加で整える場合はES生成前の材料整理として続けられます。"
        : "材料が揃うとガクチカESを作成できます。";

  const currentSessionIndex = currentSessionId
    ? sessions.findIndex((session) => session.id === currentSessionId)
    : -1;
  const currentSessionLabel = currentSessionIndex >= 0 ? `#${sessions.length - currentSessionIndex}` : null;

  const state = useMemo(() => ({
    messages,
    nextQuestion,
    questionCount,
    isCompleted,
    isInterviewReadyState,
    isLoading,
    isSending,
    isWaitingForResponse,
    answer,
    isAIPowered,
    conversationState,
    conversationStarted,
    isStarting,
    isResumingSession,
    gakuchikaTitle,
    gakuchikaContent,
    showStarInfo,
    summary,
    summaryRequested,
    isSummaryLoading,
    sessions,
    assistantPhase,
    isTextStreaming,
    streamingText,
    isBufferingQuestionChunks,
    currentSessionId,
    isGeneratingDraft,
    restartDialogOpen,
    draftCharLimit,
    processingText,
    draftReady,
    interviewReady,
    generatedDraft,
    shouldPauseConversation,
    gakuchikaDraftHelperText,
    currentSessionLabel,
    isDraftModalOpen,
    generatedDraftText,
    generatedDocumentId,
    generatedDraftQuality,
  }), [
    messages,
    nextQuestion,
    questionCount,
    isCompleted,
    isInterviewReadyState,
    isLoading,
    isSending,
    isWaitingForResponse,
    answer,
    isAIPowered,
    conversationState,
    conversationStarted,
    isStarting,
    isResumingSession,
    gakuchikaTitle,
    gakuchikaContent,
    showStarInfo,
    summary,
    summaryRequested,
    isSummaryLoading,
    sessions,
    assistantPhase,
    isTextStreaming,
    streamingText,
    isBufferingQuestionChunks,
    currentSessionId,
    isGeneratingDraft,
    restartDialogOpen,
    draftCharLimit,
    processingText,
    draftReady,
    interviewReady,
    generatedDraft,
    shouldPauseConversation,
    gakuchikaDraftHelperText,
    currentSessionLabel,
    isDraftModalOpen,
    generatedDraftText,
    generatedDocumentId,
    generatedDraftQuality,
  ]);

  return {
    state,
    actions: {
      setAnswer,
      setIsLoading,
      setShowStarInfo,
      fetchConversation,
      retrySummary,
      startDeepDive,
      send,
      selectSession,
      resumeSession,
      discardDraftAndResumeSession,
      generateDraft,
      restartConversation,
      confirmRestartConversation,
      setRestartDialogOpen,
      setDraftCharLimit,
      setIsDraftModalOpen,
    },
  };
}
