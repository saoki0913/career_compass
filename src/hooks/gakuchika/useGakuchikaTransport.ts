"use client";

import { useCallback, useEffect, useState } from "react";

import { appendOptimisticUserMessage, rollbackOptimisticMessageById } from "@/hooks/conversation/optimistic-message";
import { parseApiErrorResponse } from "@/lib/api-errors";
import { reportUserFacingError } from "@/lib/client-error-ui";
import {
  fetchGakuchikaConversation,
  fetchGakuchikaDetail,
  resumeGakuchikaConversation,
  startGakuchikaConversation,
  streamGakuchikaConversation,
} from "@/lib/gakuchika/client-api";
import { getDefaultConversationState } from "@/lib/gakuchika/conversation-state";
import { parseGakuchikaSummary } from "@/lib/gakuchika/summary";
import {
  getProcessingPhase,
  normalizeGakuchikaMessages,
  parseGakuchikaCharLimitType,
  SUMMARY_POLL_INTERVAL_MS,
  SUMMARY_POLL_MAX_ATTEMPTS,
  type PendingGakuchikaCompleteData,
} from "@/lib/gakuchika/ui";

export function useGakuchikaTransport({
  gakuchikaId,
  acquireLock,
  releaseLock,
  setup,
  domain,
  playback,
  answer,
  setAnswer,
  setError,
  isGeneratingDraft,
}: {
  gakuchikaId: string;
  acquireLock: (label: string) => boolean;
  releaseLock: () => void;
  setup: any;
  domain: any;
  playback: any;
  answer: string;
  setAnswer: (value: string) => void;
  setError: (value: string | null) => void;
  isGeneratingDraft: boolean;
}) {
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [isWaitingForResponse, setIsWaitingForResponse] = useState(false);

  const fetchSummaryIfAvailable = useCallback(async (): Promise<boolean> => {
    try {
      const response = await fetchGakuchikaDetail(gakuchikaId);
      if (!response.ok) return false;

      const data = await response.json();
      const parsedSummary = parseGakuchikaSummary(data.gakuchika?.summary ?? null);
      if (!parsedSummary) return false;

      domain.setSummary(parsedSummary);
      domain.setIsSummaryLoading(false);
      return true;
    } catch {
      return false;
    }
  }, [gakuchikaId, domain.setSummary, domain.setIsSummaryLoading]);

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
        setup.setConversationStarted(false);
        setup.setGakuchikaTitle(conversationData.gakuchikaTitle || "");
        setup.setGakuchikaContent(conversationData.gakuchikaContent || null);
        domain.setSessions([]);
        domain.setConversationState(getDefaultConversationState());
        domain.setSummary(null);
        domain.setIsSummaryLoading(false);
      } else {
        setup.setConversationStarted(true);
        domain.setMessages(normalizeGakuchikaMessages(conversationData.messages));
        domain.setNextQuestion(conversationData.nextQuestion);
        domain.setQuestionCount(conversationData.questionCount || 0);
        domain.setIsCompleted(conversationData.isCompleted || false);
        domain.setIsInterviewReadyState(Boolean(conversationData.isInterviewReady));
        domain.setIsAIPowered(conversationData.isAIPowered ?? true);
        domain.setConversationState(conversationData.conversationState || getDefaultConversationState());
        domain.setSessions(conversationData.sessions || []);
        domain.setCurrentSessionId(conversationData.conversation?.id || null);
      }

      if (gakuchikaRes.ok) {
        const gakuchikaData = await gakuchikaRes.json();
        setup.setGakuchikaTitle(gakuchikaData.gakuchika?.title || "");
        setup.setGakuchikaContent(gakuchikaData.gakuchika?.content || null);
        domain.setDraftCharLimit(parseGakuchikaCharLimitType(gakuchikaData.gakuchika?.charLimitType));
        const parsedSummary = parseGakuchikaSummary(gakuchikaData.gakuchika?.summary ?? null);
        if (parsedSummary) {
          domain.setSummary(parsedSummary);
          domain.setIsSummaryLoading(false);
        } else if (conversationData.isInterviewReady) {
          domain.setSummary(null);
          domain.setIsSummaryLoading(true);
        } else {
          domain.setSummary(null);
          domain.setIsSummaryLoading(false);
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
      domain.setAssistantPhase("idle");
      setIsLoading(false);
    }
    // `domain` / `setup` は毎レンダーで新しいオブジェクト参照になるため列挙すると
    // useEffect([fetchConversation]) が毎回走り GET がループする。安定した setter のみに絞る。
  }, [
    gakuchikaId,
    setError,
    setup.setConversationStarted,
    setup.setGakuchikaTitle,
    setup.setGakuchikaContent,
    domain.setMessages,
    domain.setNextQuestion,
    domain.setQuestionCount,
    domain.setIsCompleted,
    domain.setIsInterviewReadyState,
    domain.setIsAIPowered,
    domain.setConversationState,
    domain.setSessions,
    domain.setCurrentSessionId,
    domain.setSummary,
    domain.setIsSummaryLoading,
    domain.setDraftCharLimit,
    domain.setAssistantPhase,
  ]);

  useEffect(() => {
    void fetchConversation();
  }, [fetchConversation]);

  useEffect(() => {
    if (!domain.isInterviewReadyState || !domain.isSummaryLoading || domain.summary) return;

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
        domain.setIsSummaryLoading(false);
      }
    };

    void poll();
    return () => {
      cancelled = true;
    };
  }, [
    domain.isInterviewReadyState,
    domain.isSummaryLoading,
    domain.summary,
    domain.setIsSummaryLoading,
    fetchSummaryIfAvailable,
  ]);

  const retrySummary = useCallback(async () => {
    domain.setIsSummaryLoading(true);
    const ok = await fetchSummaryIfAvailable();
    if (!ok) {
      domain.setIsSummaryLoading(false);
    }
  }, [domain.setIsSummaryLoading, fetchSummaryIfAvailable]);

  const startDeepDive = useCallback(async () => {
    setup.setIsStarting(true);
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
      domain.setCurrentSessionId(data.conversation?.id || null);
      setup.setConversationStarted(true);
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
      setup.setIsStarting(false);
    }
  }, [
    domain.setCurrentSessionId,
    fetchConversation,
    gakuchikaId,
    setError,
    setup.setIsStarting,
    setup.setConversationStarted,
  ]);

  const send = useCallback(async () => {
    if (!answer.trim() || isSending) return;
    if (!acquireLock("AIに送信中")) return;

    const trimmedAnswer = answer.trim();
    const optimisticUpdate = appendOptimisticUserMessage(domain.messages, "optimistic", (optimisticId) => ({
      id: optimisticId,
      role: "user",
      content: trimmedAnswer,
      isOptimistic: true,
    }));
    const optimisticId = optimisticUpdate.optimisticId;

    domain.setMessages(optimisticUpdate.messages);
    setAnswer("");
    setIsSending(true);
    setIsWaitingForResponse(true);
    setError(null);
    domain.setAssistantPhase("organizing_intent");
    playback.setPendingCompleteData(null);
    playback.setStreamingTargetText("");
    playback.setIsTextStreaming(false);
    playback.setStreamingSessionId((prev: number) => prev + 1);
    playback.setIsBufferingQuestionChunks(false);
    domain.setNextQuestion(null);

    let receivedComplete = false;
    let hasReceivedQuestionStream = false;
    let streamedQuestionText = "";
    let startedQuestionPlayback = false;

    try {
      const response = await streamGakuchikaConversation(gakuchikaId, {
        answer: trimmedAnswer,
        sessionId: domain.currentSessionId,
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
            domain.setConversationState((prev: any) =>
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
            domain.setAssistantPhase(getProcessingPhase(event.step));
          } else if (event.type === "string_chunk" && event.path === "question" && typeof event.text === "string") {
            hasReceivedQuestionStream = true;
            streamedQuestionText += event.text;
            playback.setIsBufferingQuestionChunks(true);
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
            const fromComplete = typeof nextData.nextQuestion === "string" ? nextData.nextQuestion.trim() : "";
            const questionForPlayback = fromComplete || streamedQuestionText.trim();

            if (startedQuestionPlayback) {
              if (questionForPlayback) {
                playback.setStreamingTargetText(questionForPlayback);
              }
              playback.setPendingCompleteData(nextData);
            } else if (questionForPlayback) {
              playback.setStreamingTargetText(questionForPlayback);
              playback.setIsTextStreaming(true);
              setIsWaitingForResponse(false);
              playback.setIsBufferingQuestionChunks(false);
              playback.setPendingCompleteData(nextData);
              domain.setAssistantPhase("idle");
              startedQuestionPlayback = true;
            } else {
              domain.applyConversationUpdate(nextData);
              setIsWaitingForResponse(false);
              playback.setIsBufferingQuestionChunks(false);
              domain.setAssistantPhase("idle");
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
      domain.setMessages((prev: any[]) => rollbackOptimisticMessageById(prev, optimisticId));
      setAnswer(trimmedAnswer);
      domain.setNextQuestion(null);
      playback.setPendingCompleteData(null);
      playback.setStreamingTargetText("");
      playback.setIsTextStreaming(false);
      playback.setIsBufferingQuestionChunks(false);
      domain.setAssistantPhase("idle");
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
        playback.setStreamingTargetText("");
        playback.setIsTextStreaming(false);
        playback.setIsBufferingQuestionChunks(false);
        domain.setAssistantPhase("idle");
      }
      releaseLock();
    }
  }, [acquireLock, answer, domain, gakuchikaId, isSending, playback, releaseLock, setAnswer, setError]);

  const selectSession = useCallback(async (sessionId: string) => {
    domain.setCurrentSessionId(sessionId);
    setIsLoading(true);
    await fetchConversation(sessionId);
  }, [domain.setCurrentSessionId, fetchConversation]);

  const resumeSession = useCallback(async () => {
    try {
      const response = await resumeGakuchikaConversation(gakuchikaId, {
        sessionId: domain.currentSessionId,
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

      setup.setConversationStarted(true);
      domain.setCurrentSessionId(data.conversation?.id || null);
      domain.setMessages(normalizeGakuchikaMessages(data.messages));
      domain.setNextQuestion(data.nextQuestion || null);
      domain.setQuestionCount(data.questionCount || 0);
      domain.setIsCompleted(Boolean(data.isCompleted));
      domain.setIsInterviewReadyState(Boolean(data.isInterviewReady));
      domain.setConversationState(data.conversationState || getDefaultConversationState());
      domain.setSessions(data.sessions || []);
      domain.setIsAIPowered(data.isAIPowered ?? true);
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
  }, [
    domain.currentSessionId,
    domain.setCurrentSessionId,
    domain.setMessages,
    domain.setNextQuestion,
    domain.setQuestionCount,
    domain.setIsCompleted,
    domain.setIsInterviewReadyState,
    domain.setConversationState,
    domain.setSessions,
    domain.setIsAIPowered,
    gakuchikaId,
    setError,
    setup.setConversationStarted,
  ]);

  const restartConversation = useCallback(() => {
    if (setup.isStarting || isSending || isGeneratingDraft) return;
    setup.setRestartDialogOpen(true);
  }, [isGeneratingDraft, isSending, setup]);

  const confirmRestartConversation = useCallback(async () => {
    if (setup.isStarting || isSending || isGeneratingDraft) return;
    await startDeepDive();
    setup.setRestartDialogOpen(false);
  }, [isGeneratingDraft, isSending, setup, startDeepDive]);

  return {
    isLoading,
    isSending,
    isWaitingForResponse,
    fetchConversation,
    retrySummary,
    startDeepDive,
    send,
    selectSession,
    resumeSession,
    restartConversation,
    confirmRestartConversation,
  };
}
