"use client";

import { cn } from "@/lib/utils";

interface ThinkingIndicatorProps {
  text?: string;
  /**
   * Optional context label that narrates the current focus (e.g.
   * "行動について整理しています"). When provided it is shown as a
   * secondary line under the primary `text` so the student can see
   * what the AI is thinking about, not just that it is thinking.
   */
  contextLabel?: string | null;
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
  contextLabel,
  className,
}: ThinkingIndicatorProps) {
  const trimmedContext =
    typeof contextLabel === "string" ? contextLabel.trim() : "";
  const showContext = trimmedContext.length > 0 && trimmedContext !== text;

  return (
    <div className={cn("flex justify-start animate-message-appear", className)}>
      <div className="max-w-[80%] rounded-2xl px-4 py-3 bg-muted">
        <div className="flex items-center gap-3">
          {/* Animated dots */}
          <div className="flex items-center gap-1" aria-hidden>
            <span className="w-2 h-2 rounded-full bg-muted-foreground/60 animate-typing-dot" />
            <span className="w-2 h-2 rounded-full bg-muted-foreground/60 animate-typing-dot-delayed-1" />
            <span className="w-2 h-2 rounded-full bg-muted-foreground/60 animate-typing-dot-delayed-2" />
          </div>
          {/* Text label */}
          <div className="flex flex-col leading-tight">
            <span className="text-sm text-muted-foreground">{text}</span>
            {showContext ? (
              <span className="text-[11px] text-muted-foreground/80">
                {trimmedContext}
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

export default ThinkingIndicator;
