"use client";

import { cn } from "@/lib/utils";

interface ChatMessageProps {
  role: "user" | "assistant";
  content: string;
  isOptimistic?: boolean;
  isStreaming?: boolean;
  className?: string;
}

/**
 * ChatMessage - Message bubble component
 *
 * UX Psychology:
 * - Doherty Threshold: isOptimistic flag shows message immediately
 * - Visual Hierarchy: Different colors for user/assistant
 */
export function ChatMessage({
  role,
  content,
  isStreaming = false,
  className,
}: ChatMessageProps) {
  return (
    <div
      className={cn(
        "flex animate-message-appear",
        role === "user" ? "justify-end" : "justify-start",
        className
      )}
    >
      <div
        className={cn(
          "max-w-[80%] rounded-2xl px-4 py-3 transition-opacity duration-200",
          role === "user"
            ? "bg-primary text-primary-foreground"
            : "bg-muted"
        )}
      >
        <p className="text-sm whitespace-pre-wrap">
          {content}
          {isStreaming && (
            <span
              aria-hidden="true"
              className="ml-0.5 inline-block h-[1em] w-2 translate-y-0.5 rounded-sm bg-current/50 animate-pulse"
            />
          )}
        </p>
      </div>
    </div>
  );
}

export default ChatMessage;
