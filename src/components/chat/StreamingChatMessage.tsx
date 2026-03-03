"use client";

import { cn } from "@/lib/utils";

interface StreamingChatMessageProps {
  streamingText: string;
  isStreaming: boolean;
  className?: string;
}

/**
 * StreamingChatMessage - Chat bubble with blinking cursor for streaming text.
 *
 * Shows accumulated text as it arrives from the LLM token stream,
 * with a blinking cursor at the end while streaming is active.
 */
export function StreamingChatMessage({
  streamingText,
  isStreaming,
  className,
}: StreamingChatMessageProps) {
  if (!streamingText && !isStreaming) return null;

  return (
    <div className={cn("flex justify-start animate-message-appear", className)}>
      <div className="max-w-[80%] rounded-2xl px-4 py-3 bg-muted">
        <p className="text-sm whitespace-pre-wrap">
          {streamingText}
          {isStreaming && (
            <span className="inline-block w-[2px] h-[1em] bg-foreground/70 align-text-bottom ml-[1px] animate-pulse" />
          )}
        </p>
      </div>
    </div>
  );
}

export default StreamingChatMessage;
