"use client";

import { startTransition, useCallback, useState } from "react";

import type {
  CausalGap,
  ConversationMode,
  EvidenceCard,
  MotivationMessage,
  MotivationProgress,
  MotivationStageKey,
  RoleOptionsResponse,
  StageStatus,
} from "@/lib/motivation/ui";

import type { ConversationPayload, PendingCompleteData } from "./types";

function withIds(
  messages: Array<{ role: "user" | "assistant"; content: string; id?: string }>,
): MotivationMessage[] {
  return messages.map((message, index) => ({
    ...message,
    id: message.id || `msg-${index}`,
  }));
}

export function useMotivationDomain({
  applySetupSelection,
}: {
  applySetupSelection: (
    setup: ConversationPayload["setup"],
    roleOptions: RoleOptionsResponse | null,
    conversationContext: ConversationPayload["conversationContext"],
  ) => void;
}) {
  const [messages, setMessages] = useState<MotivationMessage[]>([]);
  const [nextQuestion, setNextQuestion] = useState<string | null>(null);
  const [questionCount, setQuestionCount] = useState(0);
  const [isDraftReady, setIsDraftReady] = useState(false);
  const [evidenceSummary, setEvidenceSummary] = useState<string | null>(null);
  const [evidenceCards, setEvidenceCards] = useState<EvidenceCard[]>([]);
  const [questionStage, setQuestionStage] = useState<MotivationStageKey | null>(null);
  const [stageStatus, setStageStatus] = useState<StageStatus | null>(null);
  const [coachingFocus, setCoachingFocus] = useState<string | null>(null);
  const [conversationMode, setConversationMode] = useState<ConversationMode>("slot_fill");
  const [currentSlot, setCurrentSlot] = useState<Exclude<MotivationStageKey, "closing"> | null>(null);
  const [currentIntent, setCurrentIntent] = useState<string | null>(null);
  const [nextAdvanceCondition, setNextAdvanceCondition] = useState<string | null>(null);
  const [progress, setProgress] = useState<MotivationProgress | null>(null);
  const [causalGaps, setCausalGaps] = useState<CausalGap[]>([]);
  const [conversationLoadError, setConversationLoadError] = useState<string | null>(null);

  const applyConversationPayload = useCallback(
    (conversation: ConversationPayload, roleOptions: RoleOptionsResponse | null) => {
      setMessages(withIds(conversation.messages || []));
      setNextQuestion(conversation.nextQuestion ?? null);
      setQuestionCount(conversation.questionCount || 0);
      setIsDraftReady(conversation.isDraftReady || false);
      setEvidenceSummary(conversation.evidenceSummary || null);
      setEvidenceCards(conversation.evidenceCards || []);
      setQuestionStage(conversation.questionStage || null);
      setStageStatus(conversation.stageStatus || null);
      setCoachingFocus(conversation.coachingFocus || null);
      setConversationMode(conversation.conversationMode || "slot_fill");
      setCurrentSlot(conversation.currentSlot || null);
      setCurrentIntent(conversation.currentIntent || null);
      setNextAdvanceCondition(conversation.nextAdvanceCondition || null);
      setProgress(conversation.progress || null);
      setCausalGaps(conversation.causalGaps || []);
      applySetupSelection(conversation.setup, roleOptions, conversation.conversationContext);
      setConversationLoadError(conversation.error || null);
    },
    [applySetupSelection],
  );

  const applyPendingCompleteData = useCallback((pendingCompleteData: PendingCompleteData) => {
    startTransition(() => {
      setMessages(pendingCompleteData.messages);
      setNextQuestion(pendingCompleteData.nextQuestion);
      setQuestionCount(pendingCompleteData.questionCount || 0);
      setIsDraftReady(pendingCompleteData.isDraftReady || false);
      setEvidenceSummary(pendingCompleteData.evidenceSummary || null);
      setEvidenceCards(pendingCompleteData.evidenceCards || []);
      setQuestionStage(pendingCompleteData.questionStage || null);
      setStageStatus(pendingCompleteData.stageStatus || null);
      setCoachingFocus(pendingCompleteData.coachingFocus || null);
      setConversationMode(pendingCompleteData.conversationMode || "slot_fill");
      setCurrentSlot(pendingCompleteData.currentSlot || null);
      setCurrentIntent(pendingCompleteData.currentIntent || null);
      setNextAdvanceCondition(pendingCompleteData.nextAdvanceCondition || null);
      setProgress(pendingCompleteData.progress || null);
      setCausalGaps(pendingCompleteData.causalGaps || []);
    });
  }, []);

  const resetConversationState = useCallback(() => {
    startTransition(() => {
      setMessages([]);
      setNextQuestion(null);
      setQuestionCount(0);
      setIsDraftReady(false);
      setEvidenceSummary(null);
      setEvidenceCards([]);
      setQuestionStage(null);
      setStageStatus(null);
      setCoachingFocus(null);
      setConversationMode("slot_fill");
      setCurrentSlot(null);
      setCurrentIntent(null);
      setNextAdvanceCondition(null);
      setProgress(null);
      setCausalGaps([]);
      setConversationLoadError(null);
    });
  }, []);

  return {
    messages,
    nextQuestion,
    questionCount,
    isDraftReady,
    evidenceSummary,
    evidenceCards,
    questionStage,
    stageStatus,
    coachingFocus,
    conversationMode,
    currentSlot,
    currentIntent,
    nextAdvanceCondition,
    progress,
    causalGaps,
    conversationLoadError,
    setMessages,
    setNextQuestion,
    setQuestionCount,
    setIsDraftReady,
    setEvidenceSummary,
    setEvidenceCards,
    setQuestionStage,
    setStageStatus,
    setCoachingFocus,
    setConversationMode,
    setCurrentSlot,
    setCurrentIntent,
    setNextAdvanceCondition,
    setProgress,
    setCausalGaps,
    setConversationLoadError,
    applyConversationPayload,
    applyPendingCompleteData,
    resetConversationState,
    withIds,
  };
}
