import { useMemo } from "react";

import type { ConversationState } from "@/lib/gakuchika/conversation-state";
import { getConversationBadgeLabel } from "@/lib/gakuchika/conversation-state";
import type { Message } from "@/lib/gakuchika/ui";

// ---------------------------------------------------------------------------
// Input: subset of controller state consumed by business derivations
// ---------------------------------------------------------------------------

export interface GakuchikaViewModelInput {
  messages: Message[];
  conversationState: ConversationState | null;
}

// ---------------------------------------------------------------------------
// Output: derived business state
// ---------------------------------------------------------------------------

export interface GakuchikaViewModel {
  /** Number of confirmed (non-optimistic) user messages */
  answeredCount: number;
  /** Contextual label derived from the server-side progressLabel for ThinkingIndicator */
  thinkingContextLabel: string | null;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useGakuchikaViewModel(input: GakuchikaViewModelInput): GakuchikaViewModel {
  const { messages, conversationState } = input;

  const answeredCount = useMemo(
    () =>
      messages.filter(
        (message) => message.role === "user" && !message.isOptimistic,
      ).length,
    [messages],
  );

  const thinkingContextLabel = useMemo(
    () => progressLabelToContextLabel(conversationState?.progressLabel ?? null),
    [conversationState?.progressLabel],
  );

  return {
    answeredCount,
    thinkingContextLabel,
  };
}

// ---------------------------------------------------------------------------
// Pure helper (testable without React)
// ---------------------------------------------------------------------------

/**
 * Map the short `progressLabel` (e.g. "行動を整理中") returned by FastAPI
 * into a more conversational `contextLabel` for the ThinkingIndicator, so
 * the student sees *what* the AI is thinking about, not just that it is.
 */
export function progressLabelToContextLabel(progressLabel: string | null | undefined): string | null {
  if (!progressLabel) return null;
  const trimmed = progressLabel.trim();
  if (!trimmed) return null;
  if (/状況|背景/.test(trimmed)) return "状況について整理しています...";
  if (/課題|困難|問題/.test(trimmed)) return "課題について整理しています...";
  if (/行動|取り組み/.test(trimmed)) return "行動について整理しています...";
  if (/結果|成果/.test(trimmed)) return "成果について整理しています...";
  if (/学び/.test(trimmed)) return "学びについて整理しています...";
  if (/深掘り/.test(trimmed)) return "深掘りの論点を整理しています...";
  return `${trimmed}...`;
}

// Re-export for use in component (already imported there separately, but
// the view model is the canonical location for session badge logic)
export { getConversationBadgeLabel };
