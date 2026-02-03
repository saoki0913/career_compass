"use client";

import { cn } from "@/lib/utils";

interface ChatMessageProps {
  role: "user" | "assistant";
  content: string;
  isOptimistic?: boolean;
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
  isOptimistic = false,
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
            : "bg-muted",
          isOptimistic && "opacity-70"
        )}
      >
        <p className="text-sm whitespace-pre-wrap">{content}</p>
        {isOptimistic && (
          <div className="flex items-center gap-1 mt-1">
            <svg
              className="w-3 h-3 animate-spin text-primary-foreground/60"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            <span className="text-xs text-primary-foreground/60">送信中...</span>
          </div>
        )}
      </div>
    </div>
  );
}

export default ChatMessage;
