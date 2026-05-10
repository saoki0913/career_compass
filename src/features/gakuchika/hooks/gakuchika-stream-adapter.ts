"use client";

import type { ConversationStreamAdapter } from "@/hooks/conversation";
import { streamGakuchikaConversation } from "@/features/gakuchika/application/client-api";
import { getDefaultConversationState } from "@/features/gakuchika/domain/conversation-state";
import {
  getProcessingPhase,
  normalizeGakuchikaMessages,
  type AssistantProcessingPhase,
  type Message,
  type PendingGakuchikaCompleteData,
} from "@/features/gakuchika/domain/ui";
import type { ConversationState } from "@/features/gakuchika/domain/conversation-state";

export interface GakuchikaStreamContext {
  hasReceivedQuestionStream: boolean;
  isBufferingQuestionChunks: boolean;
  assistantPhase: AssistantProcessingPhase;
}

function toGakuchikaDomainState(data: Record<string, unknown>): PendingGakuchikaCompleteData {
  return {
    messages: normalizeGakuchikaMessages(data.messages),
    nextQuestion: (data.nextQuestion as string) ?? null,
    questionCount: (data.questionCount as number) || 0,
    isCompleted: (data.isCompleted as boolean) || false,
    isInterviewReady: Boolean(data.isInterviewReady),
    conversationState: (data.conversationState as ConversationState) || getDefaultConversationState(),
    isAIPowered: (data.isAIPowered as boolean) ?? true,
  };
}

export function createGakuchikaStreamAdapter(deps: {
  gakuchikaId: string;
  currentSessionId: string | null;
  commitState: (
    state: PendingGakuchikaCompleteData,
    context: GakuchikaStreamContext,
  ) => void;
  onSideEffect: (context: GakuchikaStreamContext) => void;
  onError: (error: unknown, originalAnswer: string) => void;
}): ConversationStreamAdapter<PendingGakuchikaCompleteData, Message, GakuchikaStreamContext> {
  return {
    createStreamContext: () => ({
      hasReceivedQuestionStream: false,
      isBufferingQuestionChunks: false,
      assistantPhase: "organizing_intent",
    }),
    fetchStream: (answer) =>
      streamGakuchikaConversation(deps.gakuchikaId, {
        answer,
        sessionId: deps.currentSessionId,
      }),
    buildOptimisticMessage: (id, content) => ({
      id,
      role: "user",
      content,
      isOptimistic: true,
    }),
    processSSEEvent: (event, context, accumulated) => {
      if (event.type === "field_complete" && event.path === "coach_progress_message") {
        return { action: "noop", context };
      }

      if (event.type === "progress" && !context.hasReceivedQuestionStream) {
        return {
          action: "set_progress",
          label: null,
          context: {
            ...context,
            assistantPhase: getProcessingPhase(event.step as string),
          },
        };
      }

      if (
        event.type === "string_chunk" &&
        event.path === "question" &&
        typeof event.text === "string"
      ) {
        return {
          action: "accumulate_chunk",
          text: event.text,
          context: {
            ...context,
            hasReceivedQuestionStream: true,
            isBufferingQuestionChunks: true,
          },
        };
      }

      if (event.type === "complete") {
        const domainState = toGakuchikaDomainState(event.data as Record<string, unknown>);
        const fromComplete = domainState.nextQuestion?.trim() || "";
        return {
          action: "complete",
          domainState,
          playbackText: fromComplete || accumulated.streamedQuestionText.trim(),
          context: {
            ...context,
            assistantPhase: "idle",
            isBufferingQuestionChunks: false,
          },
        };
      }

      if (event.type === "error") {
        return {
          action: "error",
          message: (event.message as string) || "AIエラーが発生しました",
          context,
        };
      }

      return { action: "noop", context };
    },
    getPlaybackText: (state) => state.nextQuestion?.trim() || "",
    commitState: deps.commitState,
    onSideEffect: deps.onSideEffect,
    onError: deps.onError,
    errorMeta: {
      code: "GAKUCHIKA_CONVERSATION_STREAM_FAILED",
      userMessage: "送信に失敗しました。",
      action: "時間を置いて、もう一度お試しください。",
      retryable: true,
      logContext: "GakuchikaPage.handleSend",
    },
  };
}
