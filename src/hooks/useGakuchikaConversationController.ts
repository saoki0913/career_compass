"use client";

import { startTransition, useCallback, useEffect, useMemo, useState } from "react";

import { useOperationLock } from "@/hooks/useOperationLock";
import { useStreamingTextPlayback } from "@/hooks/useStreamingTextPlayback";
import { appendOptimisticUserMessage, rollbackOptimisticMessageById } from "@/hooks/conversation/optimistic-message";
import { parseApiErrorResponse } from "@/lib/api-errors";
import { reportUserFacingError } from "@/lib/client-error-ui";
import {
  fetchGakuchikaConversation,
  fetchGakuchikaDetail,
  generateGakuchikaEsDraft,
  resumeGakuchikaConversation,
  startGakuchikaConversation,
  streamGakuchikaConversation,
} from "@/lib/gakuchika/client-api";
import {
  getDefaultConversationState,
  getGakuchikaNextAction,
  hasDraftText,
  isDraftReady,
  isInterviewReady,
  type ConversationState,
} from "@/lib/gakuchika/conversation-state";
import { parseGakuchikaSummary } from "@/lib/gakuchika/summary";
import {
  getProcessingPhase,
  normalizeGakuchikaMessages,
  PROCESSING_LABELS,
  SUMMARY_POLL_INTERVAL_MS,
  SUMMARY_POLL_MAX_ATTEMPTS,
  parseGakuchikaCharLimitType,
  type AssistantProcessingPhase,
  type ConversationUpdate,
  type GakuchikaDraftCharLimit,
  type PendingGakuchikaCompleteData,
  type Session,
  type Message,
} from "@/lib/gakuchika/ui";

type GakuchikaSummary = ReturnType<typeof parseGakuchikaSummary>;

type ControllerParams = {
  gakuchikaId: string;
  onDraftGenerated: (documentId: string) => void;
};

export function useGakuchikaConversationController({
  gakuchikaId,
  onDraftGenerated,
}: ControllerParams) {
  const { acquireLock, releaseLock } = useOperationLock();

  const [messages, setMessages] = useState<Message[]>([]);
  const [nextQuestion, setNextQuestion] = useState<string | null>(null);
  const [questionCount, setQuestionCount] = useState(0);
  const [isCompleted, setIsCompleted] = useState(false);
  const [isInterviewReadyState, setIsInterviewReadyState] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [isWaitingForResponse, setIsWaitingForResponse] = useState(false);
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isAIPowered, setIsAIPowered] = useState(true);
  const [conversationState, setConversationState] = useState<ConversationState | null>(null);
  const [conversationStarted, setConversationStarted] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [gakuchikaTitle, setGakuchikaTitle] = useState("");
  const [gakuchikaContent, setGakuchikaContent] = useState<string | null>(null);
  const [showStarInfo, setShowStarInfo] = useState(false);
  const [summary, setSummary] = useState<GakuchikaSummary>(null);
  const [isSummaryLoading, setIsSummaryLoading] = useState(false);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [assistantPhase, setAssistantPhase] = useState<AssistantProcessingPhase>("idle");
  const [streamingTargetText, setStreamingTargetText] = useState("");
  const [isTextStreaming, setIsTextStreaming] = useState(false);
  const [streamingSessionId, setStreamingSessionId] = useState(0);
  const [pendingCompleteData, setPendingCompleteData] = useState<PendingGakuchikaCompleteData | null>(null);
  const [isBufferingQuestionChunks, setIsBufferingQuestionChunks] = useState(false);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [isGeneratingDraft, setIsGeneratingDraft] = useState(false);
  const [restartDialogOpen, setRestartDialogOpen] = useState(false);
  const [draftCharLimit, setDraftCharLimit] = useState<GakuchikaDraftCharLimit>(400);

  const { displayedText: streamingText, isPlaybackComplete } = useStreamingTextPlayback(
    streamingTargetText,
    { isActive: isTextStreaming, resetKey: streamingSessionId },
  );

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
        setIsSummaryLoading(update.summaryPending);
      } else if (!update.isCompleted) {
        setSummary(null);
        setIsSummaryLoading(false);
      }
    });
  }, []);

  useEffect(() => {
    if (!pendingCompleteData || !isTextStreaming) return;
    if (!isPlaybackComplete) return;

    const timer = window.setTimeout(() => {
      startTransition(() => {
        applyConversationUpdate(pendingCompleteData);
        setPendingCompleteData(null);
        setIsTextStreaming(false);
        setStreamingTargetText("");
        setIsBufferingQuestionChunks(false);
      });
    }, 180);

    return () => window.clearTimeout(timer);
  }, [applyConversationUpdate, isPlaybackComplete, isTextStreaming, pendingCompleteData]);

  const fetchSummaryIfAvailable = useCallback(async (): Promise<boolean> => {
    try {
      const response = await fetchGakuchikaDetail(gakuchikaId);
      if (!response.ok) return false;

      const data = await response.json();
      const parsedSummary = parseGakuchikaSummary(data.gakuchika?.summary ?? null);
      if (!parsedSummary) return false;

      startTransition(() => {
        setSummary(parsedSummary);
        setIsSummaryLoading(false);
      });
      return true;
    } catch {
      return false;
    }
  }, [gakuchikaId]);

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
      } else {
        setConversationStarted(true);
        setMessages(normalizeGakuchikaMessages(conversationData.messages));
        setNextQuestion(conversationData.nextQuestion);
        setQuestionCount(conversationData.questionCount || 0);
        setIsCompleted(conversationData.isCompleted || false);
        setIsInterviewReadyState(Boolean(conversationData.isInterviewReady));
        setIsAIPowered(conversationData.isAIPowered ?? true);
        setConversationState(conversationData.conversationState || getDefaultConversationState());
        setSessions(conversationData.sessions || []);
        setCurrentSessionId(conversationData.conversation?.id || null);
      }

      if (gakuchikaRes.ok) {
        const gakuchikaData = await gakuchikaRes.json();
        setGakuchikaTitle(gakuchikaData.gakuchika?.title || "");
        setGakuchikaContent(gakuchikaData.gakuchika?.content || null);
        setDraftCharLimit(parseGakuchikaCharLimitType(gakuchikaData.gakuchika?.charLimitType));
        const parsedSummary = parseGakuchikaSummary(gakuchikaData.gakuchika?.summary ?? null);
        if (parsedSummary) {
          setSummary(parsedSummary);
          setIsSummaryLoading(false);
        } else if (conversationData.isInterviewReady) {
          setSummary(null);
          setIsSummaryLoading(true);
        } else {
          setSummary(null);
          setIsSummaryLoading(false);
        }
      }
    } catch (err) {
      setError(
        reportUserFacingError(
          err,
          {
            code: "GAKUCHIKA_CONVERSATION_FETCH_FAILED",
            userMessage: "会話の取得に失敗しました。",
            action: "ページを再読み込みして、もう一度お試しください。",
            retryable: true,
          },
          "GakuchikaPage.fetchConversation",
        ),
      );
    } finally {
      setAssistantPhase("idle");
      setIsLoading(false);
    }
  }, [gakuchikaId]);

  useEffect(() => {
    void fetchConversation();
  }, [fetchConversation]);

  useEffect(() => {
    if (!isInterviewReadyState || !isSummaryLoading || summary) return;

    let cancelled = false;
    let attempts = 0;

    const poll = async () => {
      while (!cancelled && attempts < SUMMARY_POLL_MAX_ATTEMPTS) {
        attempts += 1;
        const found = await fetchSummaryIfAvailable();
        if (found || cancelled) return;
        await new Promise((resolve) => setTimeout(resolve, SUMMARY_POLL_INTERVAL_MS));
      }

      if (!cancelled) {
        setIsSummaryLoading(false);
      }
    };

    void poll();

    return () => {
      cancelled = true;
    };
  }, [fetchSummaryIfAvailable, isInterviewReadyState, isSummaryLoading, summary]);

  const retrySummary = useCallback(async () => {
    setIsSummaryLoading(true);
    const ok = await fetchSummaryIfAvailable();
    if (!ok) {
      setIsSummaryLoading(false);
    }
  }, [fetchSummaryIfAvailable]);

  const startDeepDive = useCallback(async () => {
    setIsStarting(true);
    setError(null);

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
      setError(
        reportUserFacingError(
          err,
          {
            code: "GAKUCHIKA_CONVERSATION_START_FAILED",
            userMessage: "作成の開始に失敗しました。",
            action: "時間を置いて、もう一度お試しください。",
            retryable: true,
          },
          "GakuchikaPage.handleStartDeepDive",
        ),
      );
    } finally {
      setIsStarting(false);
    }
  }, [fetchConversation, gakuchikaId]);

  const send = useCallback(async () => {
    if (!answer.trim() || isSending) return;
    if (!acquireLock("AIに送信中")) return;

    const trimmedAnswer = answer.trim();
    const optimisticUpdate = appendOptimisticUserMessage(messages, "optimistic", (optimisticId) => ({
      id: optimisticId,
      role: "user",
      content: trimmedAnswer,
      isOptimistic: true,
    }));
    const optimisticId = optimisticUpdate.optimisticId;

    setMessages(optimisticUpdate.messages);
    setAnswer("");
    setIsSending(true);
    setIsWaitingForResponse(true);
    setError(null);
    setAssistantPhase("organizing_intent");
    setPendingCompleteData(null);
    setStreamingTargetText("");
    setIsTextStreaming(false);
    setStreamingSessionId((prev) => prev + 1);
    setIsBufferingQuestionChunks(false);
    setNextQuestion(null);

    let receivedComplete = false;
    let hasReceivedQuestionStream = false;
    let streamedQuestionText = "";
    let startedQuestionPlayback = false;

    try {
      const response = await streamGakuchikaConversation(gakuchikaId, {
        answer: trimmedAnswer,
        sessionId: currentSessionId,
      });

      if (!response.ok) {
        throw await parseApiErrorResponse(
          response,
          {
            code: "GAKUCHIKA_CONVERSATION_STREAM_FAILED",
            userMessage: "送信に失敗しました。",
            action: "時間を置いて、もう一度お試しください。",
            retryable: true,
          },
          "GakuchikaPage.handleSend",
        );
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("ストリームが利用できません");

      const decoder = new TextDecoder();
      let buffer = "";

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

          if (event.type === "hint_ready") {
            setConversationState((prev) =>
              prev
                ? {
                    ...prev,
                    focusKey: event.data?.focusKey || prev.focusKey,
                    answerHint: event.data?.answerHint || prev.answerHint,
                    progressLabel: event.data?.progressLabel || prev.progressLabel,
                  }
                : prev,
            );
          } else if (event.type === "progress" && !hasReceivedQuestionStream) {
            setAssistantPhase(getProcessingPhase(event.step));
          } else if (
            event.type === "string_chunk" &&
            event.path === "question" &&
            typeof event.text === "string"
          ) {
            hasReceivedQuestionStream = true;
            streamedQuestionText += event.text;
            setIsBufferingQuestionChunks(true);
          } else if (event.type === "complete") {
            const data = event.data;
            receivedComplete = true;
            const nextData: PendingGakuchikaCompleteData = {
              messages: normalizeGakuchikaMessages(data.messages),
              nextQuestion: data.nextQuestion ?? null,
              questionCount: data.questionCount || 0,
              isCompleted: data.isCompleted || false,
              isInterviewReady: Boolean(data.isInterviewReady),
              conversationState: data.conversationState || getDefaultConversationState(),
              isAIPowered: data.isAIPowered ?? true,
              summaryPending: Boolean(data.summaryPending),
            };
            const fromComplete =
              typeof nextData.nextQuestion === "string" ? nextData.nextQuestion.trim() : "";
            const questionForPlayback = fromComplete || streamedQuestionText.trim();

            if (startedQuestionPlayback) {
              if (questionForPlayback) {
                setStreamingTargetText(questionForPlayback);
              }
              setPendingCompleteData(nextData);
            } else if (questionForPlayback) {
              setStreamingTargetText(questionForPlayback);
              setIsTextStreaming(true);
              setIsWaitingForResponse(false);
              setIsBufferingQuestionChunks(false);
              setPendingCompleteData(nextData);
              setAssistantPhase("idle");
              startedQuestionPlayback = true;
            } else {
              applyConversationUpdate(nextData);
              setIsWaitingForResponse(false);
              setIsBufferingQuestionChunks(false);
              setAssistantPhase("idle");
            }
          } else if (event.type === "error") {
            throw new Error(event.message || "AIエラーが発生しました");
          }
        }
      }

      if (!receivedComplete) {
        throw new Error("ストリームが途中で切断されました");
      }
    } catch (err) {
      setMessages((prev) => rollbackOptimisticMessageById(prev, optimisticId));
      setAnswer(trimmedAnswer);
      setNextQuestion(null);
      setPendingCompleteData(null);
      setStreamingTargetText("");
      setIsTextStreaming(false);
      setIsBufferingQuestionChunks(false);
      setAssistantPhase("idle");
      setIsWaitingForResponse(false);
      setError(
        reportUserFacingError(
          err,
          {
            code: "GAKUCHIKA_CONVERSATION_STREAM_FAILED",
            userMessage: "送信に失敗しました。",
            action: "時間を置いて、もう一度お試しください。",
            retryable: true,
          },
          "GakuchikaPage.handleSend",
        ),
      );
    } finally {
      setIsSending(false);
      setIsWaitingForResponse(false);
      if (!startedQuestionPlayback) {
        setStreamingTargetText("");
        setIsTextStreaming(false);
        setIsBufferingQuestionChunks(false);
        setAssistantPhase("idle");
      }
      releaseLock();
    }
  }, [acquireLock, answer, applyConversationUpdate, currentSessionId, gakuchikaId, isSending, releaseLock]);

  const selectSession = useCallback(async (sessionId: string) => {
    setCurrentSessionId(sessionId);
    setIsLoading(true);
    await fetchConversation(sessionId);
  }, [fetchConversation]);

  const resumeSession = useCallback(async () => {
    try {
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
          "GakuchikaPage.handleResumeSession",
        );
      }

      const data = await response.json();

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
      setError(null);
    } catch (err) {
      setError(
        reportUserFacingError(
          err,
          {
            code: "GAKUCHIKA_CONVERSATION_RESUME_FAILED",
            userMessage: "深掘りの再開に失敗しました。",
            action: "時間を置いて、もう一度お試しください。",
            retryable: true,
          },
          "GakuchikaPage.handleResumeSession",
        ),
      );
    }
  }, [currentSessionId, gakuchikaId]);

  const generateDraft = useCallback(async () => {
    if (!isDraftReady(conversationState) || isGeneratingDraft) return;
    if (!acquireLock("ガクチカESを生成中")) return;

    setIsGeneratingDraft(true);
    setError(null);

    try {
      const response = await generateGakuchikaEsDraft(gakuchikaId, { charLimit: draftCharLimit });

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
  }, [acquireLock, conversationState, draftCharLimit, gakuchikaId, isGeneratingDraft, onDraftGenerated, releaseLock]);

  const restartConversation = useCallback(() => {
    if (isStarting || isSending || isGeneratingDraft) return;
    setRestartDialogOpen(true);
  }, [isGeneratingDraft, isSending, isStarting]);

  const confirmRestartConversation = useCallback(async () => {
    if (isStarting || isSending || isGeneratingDraft) return;
    await startDeepDive();
    setRestartDialogOpen(false);
  }, [isGeneratingDraft, isSending, isStarting, startDeepDive]);

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
      ? "ES を起点に、この画面から更に深掘りできます。"
      : draftReady
        ? `ここまででガクチカESを約 ${draftCharLimit} 字で作成できます。成功時のみクレジット消費です。`
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
    error,
    isAIPowered,
    conversationState,
    conversationStarted,
    isStarting,
    gakuchikaTitle,
    gakuchikaContent,
    showStarInfo,
    summary,
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
    error,
    isAIPowered,
    conversationState,
    conversationStarted,
    isStarting,
    gakuchikaTitle,
    gakuchikaContent,
    showStarInfo,
    summary,
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
  ]);

  return {
    state,
    actions: {
      setAnswer,
      setError,
      setIsLoading,
      setShowStarInfo,
      fetchConversation,
      retrySummary,
      startDeepDive,
      send,
      selectSession,
      resumeSession,
      generateDraft,
      restartConversation,
      confirmRestartConversation,
      setRestartDialogOpen,
      setDraftCharLimit,
    },
  };
}
