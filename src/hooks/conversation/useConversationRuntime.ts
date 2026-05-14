"use client";

import { useCallback, useState } from "react";

import { AppUiError, parseApiErrorResponse } from "@/lib/api-errors";
import { reportUserFacingError } from "@/lib/client-error-ui";

import { useOperationLock } from "@/hooks/useOperationLock";

import {
  appendOptimisticUserMessage,
  rollbackOptimisticMessageById,
} from "./optimistic-message";
import { parseSSEStream } from "./sse-stream-parser";
import { createStreamTimeout } from "./stream-timeout";
import type { BaseMessage, ConversationStreamAdapter } from "./types";
import { useConversationPlayback } from "./useConversationPlayback";

export interface UseConversationRuntimeOptions<
  TDomainState,
  TMessage extends BaseMessage,
  TContext = void,
> {
  adapter: ConversationStreamAdapter<TDomainState, TMessage, TContext>;
  messages: TMessage[];
  setMessages: React.Dispatch<React.SetStateAction<TMessage[]>>;
}

export interface ConversationRuntimeResult {
  send: (answer: string) => Promise<void>;
  isSending: boolean;
  isWaitingForResponse: boolean;
  streamingText: string;
  isTextStreaming: boolean;
  streamingLabel: string | null;
}

export function useConversationRuntime<
  TDomainState,
  TMessage extends BaseMessage,
  TContext = void,
>({
  adapter,
  messages,
  setMessages,
}: UseConversationRuntimeOptions<
  TDomainState,
  TMessage,
  TContext
>): ConversationRuntimeResult {
  const { acquireLock, releaseLock } = useOperationLock();
  const [isSending, setIsSending] = useState(false);
  const [isWaitingForResponse, setIsWaitingForResponse] = useState(false);
  const [streamingLabel, setStreamingLabel] = useState<string | null>(null);

  const commitHandler = useCallback(
    (domainState: TDomainState) => {
      adapter.commitState(domainState, adapter.createStreamContext());
    },
    [adapter],
  );

  const playback = useConversationPlayback<TDomainState>({
    onCommit: commitHandler,
    commitDelayMs: 180,
  });

  const send = useCallback(
    async (answer: string) => {
      const trimmed = answer.trim();
      if (!trimmed || isSending) return;
      if (!acquireLock("AIに送信中")) return;

      const optimistic = appendOptimisticUserMessage(
        messages,
        "optimistic",
        (id) => adapter.buildOptimisticMessage(id, trimmed),
      );

      setMessages(optimistic.messages);
      setIsSending(true);
      setIsWaitingForResponse(true);
      playback.setPendingCompleteData(null);
      playback.setStreamingTargetText("");
      playback.setIsTextStreaming(false);
      playback.setStreamingSessionId(playback.streamingSessionId + 1);
      setStreamingLabel(null);

      const timeout = adapter.useStreamTimeout
        ? createStreamTimeout()
        : null;
      let context = adapter.createStreamContext();
      let streamedQuestionText = "";
      let startedPlayback = false;
      let receivedComplete = false;

      try {
        const response = await adapter.fetchStream(
          trimmed,
          timeout?.controller.signal,
        );

        if (!response.ok) {
          throw await parseApiErrorResponse(
            response,
            adapter.errorMeta,
            adapter.errorMeta.logContext,
          );
        }

        for await (const event of parseSSEStream(response)) {
          const result = adapter.processSSEEvent(event, context, {
            streamedQuestionText,
            startedPlayback,
          });

          context = result.context;

          switch (result.action) {
            case "noop":
              break;

            case "set_progress":
              if (result.label !== null) setStreamingLabel(result.label);
              adapter.onSideEffect?.(context);
              break;

            case "accumulate_chunk":
              streamedQuestionText += result.text;
              adapter.onSideEffect?.(context);
              break;

            case "complete": {
              receivedComplete = true;
              adapter.onSideEffect?.(context);

              if (startedPlayback) {
                if (result.playbackText) {
                  playback.setStreamingTargetText(result.playbackText);
                }
                playback.setPendingCompleteData(result.domainState);
              } else if (result.playbackText) {
                playback.setStreamingTargetText(result.playbackText);
                playback.setIsTextStreaming(true);
                setIsWaitingForResponse(false);
                playback.setPendingCompleteData(result.domainState);
                startedPlayback = true;
              } else {
                adapter.commitState(result.domainState, context);
                setIsWaitingForResponse(false);
              }
              break;
            }

            case "error":
              throw new AppUiError(result.message, {
                code: result.code ?? adapter.errorMeta.code,
                action: result.action_hint ?? adapter.errorMeta.action,
                retryable: result.retryable ?? adapter.errorMeta.retryable,
              });
          }
        }

        if (!receivedComplete) {
          throw new Error("ストリームが途中で切断されました");
        }
      } catch (err) {
        setMessages((prev) =>
          rollbackOptimisticMessageById(prev, optimistic.optimisticId),
        );
        playback.setPendingCompleteData(null);
        playback.setStreamingTargetText("");
        playback.setIsTextStreaming(false);
        adapter.onError(err, trimmed);
        reportUserFacingError(
          err,
          adapter.errorMeta,
          adapter.errorMeta.logContext,
        );
      } finally {
        timeout?.clear();
        setIsSending(false);
        setIsWaitingForResponse(false);
        setStreamingLabel(null);
        if (!startedPlayback) {
          playback.setStreamingTargetText("");
          playback.setIsTextStreaming(false);
        }
        releaseLock();
      }
    },
    [acquireLock, adapter, isSending, messages, playback, releaseLock, setMessages],
  );

  return {
    send,
    isSending,
    isWaitingForResponse,
    streamingText: playback.streamingText,
    isTextStreaming: playback.isTextStreaming,
    streamingLabel,
  };
}
