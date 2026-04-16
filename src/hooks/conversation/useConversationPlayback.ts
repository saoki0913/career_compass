"use client";

import { useEffect, useState } from "react";

import { useStreamingTextPlayback } from "@/hooks/useStreamingTextPlayback";

export interface UseConversationPlaybackOptions<T> {
  onCommit: (data: T) => void;
  commitDelayMs?: number;
}

export interface UseConversationPlaybackResult<T> {
  pendingCompleteData: T | null;
  setPendingCompleteData: (value: T | null) => void;
  streamingTargetText: string;
  setStreamingTargetText: (value: string) => void;
  isTextStreaming: boolean;
  setIsTextStreaming: (value: boolean) => void;
  streamingSessionId: number;
  setStreamingSessionId: (value: number) => void;
  streamingText: string;
  isPlaybackComplete: boolean;
}

export function shouldCommitConversationPlayback<T>(args: {
  pendingCompleteData: T | null;
  isTextStreaming: boolean;
  isPlaybackComplete: boolean;
}) {
  return Boolean(args.pendingCompleteData && args.isTextStreaming && args.isPlaybackComplete);
}

export function useConversationPlayback<T>({
  onCommit,
  commitDelayMs = 180,
}: UseConversationPlaybackOptions<T>): UseConversationPlaybackResult<T> {
  const [pendingCompleteData, setPendingCompleteData] = useState<T | null>(null);
  const [streamingTargetText, setStreamingTargetText] = useState("");
  const [isTextStreaming, setIsTextStreaming] = useState(false);
  const [streamingSessionId, setStreamingSessionId] = useState(0);

  const { displayedText: streamingText, isPlaybackComplete } = useStreamingTextPlayback(
    streamingTargetText,
    { isActive: isTextStreaming, resetKey: streamingSessionId },
  );

  useEffect(() => {
    if (
      !shouldCommitConversationPlayback({
        pendingCompleteData,
        isTextStreaming,
        isPlaybackComplete,
      })
    ) {
      return;
    }

    const timer = window.setTimeout(() => {
      onCommit(pendingCompleteData as T);
      setPendingCompleteData(null);
      setIsTextStreaming(false);
      setStreamingTargetText("");
    }, commitDelayMs);

    return () => window.clearTimeout(timer);
  }, [commitDelayMs, isPlaybackComplete, isTextStreaming, onCommit, pendingCompleteData]);

  return {
    pendingCompleteData,
    setPendingCompleteData,
    streamingTargetText,
    setStreamingTargetText,
    isTextStreaming,
    setIsTextStreaming,
    streamingSessionId,
    setStreamingSessionId,
    streamingText,
    isPlaybackComplete,
  };
}
