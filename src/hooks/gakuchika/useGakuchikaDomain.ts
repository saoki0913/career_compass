"use client";

import { startTransition, useCallback, useMemo, useState } from "react";

import {
  getGakuchikaNextAction,
  hasDraftText,
  isDraftReady,
  isInterviewReady,
  type ConversationState,
} from "@/lib/gakuchika/conversation-state";
import { parseGakuchikaSummary } from "@/lib/gakuchika/summary";
import {
  type AssistantProcessingPhase,
  type ConversationUpdate,
  type GakuchikaDraftCharLimit,
  type Message,
  type PendingGakuchikaCompleteData,
  type Session,
  PROCESSING_LABELS,
} from "@/lib/gakuchika/ui";

export function useGakuchikaDomain() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [nextQuestion, setNextQuestion] = useState<string | null>(null);
  const [questionCount, setQuestionCount] = useState(0);
  const [isCompleted, setIsCompleted] = useState(false);
  const [isInterviewReadyState, setIsInterviewReadyState] = useState(false);
  const [isAIPowered, setIsAIPowered] = useState(true);
  const [conversationState, setConversationState] = useState<ConversationState | null>(null);
  const [summary, setSummary] = useState<ReturnType<typeof parseGakuchikaSummary>>(null);
  const [isSummaryLoading, setIsSummaryLoading] = useState(false);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [assistantPhase, setAssistantPhase] = useState<AssistantProcessingPhase>("idle");
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [draftCharLimit, setDraftCharLimit] = useState<GakuchikaDraftCharLimit>(400);

  const applyConversationUpdate = useCallback((update: ConversationUpdate | PendingGakuchikaCompleteData) => {
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

  const computed = useMemo(() => {
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

    return {
      processingText,
      draftReady,
      interviewReady,
      generatedDraft,
      shouldPauseConversation,
      gakuchikaDraftHelperText,
      currentSessionLabel,
    };
  }, [assistantPhase, conversationState, currentSessionId, draftCharLimit, isInterviewReadyState, sessions]);

  return {
    messages,
    nextQuestion,
    questionCount,
    isCompleted,
    isInterviewReadyState,
    isAIPowered,
    conversationState,
    summary,
    isSummaryLoading,
    sessions,
    assistantPhase,
    currentSessionId,
    draftCharLimit,
    setMessages,
    setNextQuestion,
    setQuestionCount,
    setIsCompleted,
    setIsInterviewReadyState,
    setIsAIPowered,
    setConversationState,
    setSummary,
    setIsSummaryLoading,
    setSessions,
    setAssistantPhase,
    setCurrentSessionId,
    setDraftCharLimit,
    applyConversationUpdate,
    ...computed,
  };
}
