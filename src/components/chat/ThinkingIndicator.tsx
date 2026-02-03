"use client";

import { cn } from "@/lib/utils";

interface ThinkingIndicatorProps {
  text?: string;
  className?: string;
}

/**
 * ThinkingIndicator - Claude-style thinking animation
 *
 * UX Psychology: Labor Illusion
 * Shows the AI is "working" on generating a response,
 * making the wait feel more purposeful and shorter.
 */
export function ThinkingIndicator({
  text = "次の質問を考え中",
  className,
}: ThinkingIndicatorProps) {
  return (
    <div className={cn("flex justify-start animate-message-appear", className)}>
      <div className="max-w-[80%] rounded-2xl px-4 py-3 bg-muted">
        <div className="flex items-center gap-3">
          {/* Animated dots */}
          <div className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-muted-foreground/60 animate-typing-dot" />
            <span className="w-2 h-2 rounded-full bg-muted-foreground/60 animate-typing-dot-delayed-1" />
            <span className="w-2 h-2 rounded-full bg-muted-foreground/60 animate-typing-dot-delayed-2" />
          </div>
          {/* Text label */}
          <span className="text-sm text-muted-foreground">{text}</span>
        </div>
      </div>
    </div>
  );
}

export default ThinkingIndicator;
