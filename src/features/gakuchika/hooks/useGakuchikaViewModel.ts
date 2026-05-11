import { useMemo } from "react";

import type { ConversationState } from "@/features/gakuchika/domain/conversation-state";
import { getConversationBadgeLabel } from "@/features/gakuchika/domain/conversation-state";
import type { Message } from "@/features/gakuchika/domain/ui";

export interface GakuchikaViewModelInput {
  messages: Message[];
  conversationState: ConversationState | null;
  questionCount: number;
}

export interface GakuchikaViewModel {
  answeredCount: number;
  thinkingContextLabel: string | null;
  remainingLabel: string | null;
  primaryLine: string;
  estimatedTotal: number;
  questionDisplay: string;
}

function stageRemainingLabel(state: ConversationState | null): string | null {
  if (!state) return null;
  if (state.stage === "interview_ready") {
    return "面接準備まで整いました。";
  }
  if (state.stage === "deep_dive_active") {
    return "深掘りで論点を整理しています。";
  }
  if (state.stage === "draft_ready" || state.readyForDraft) {
    return "ES 材料が揃いました。";
  }
  return null;
}

function estimateRemainingQuestionsText(state: ConversationState | null): string | null {
  if (!state) return null;
  const label = stageRemainingLabel(state);
  if (label) return label;
  const remaining = state.missingElements.length;
  if (remaining === 0) return "まもなく材料が揃います。";
  if (remaining === 1) return "あと 1 問程度で材料が揃います。";
  if (remaining === 2) return "あと 1-2 問で材料が揃いそうです。";
  return "STAR の材料を順に整理していきましょう。";
}

function remainingLabelFromServerCount(state: ConversationState | null, n: number): string {
  const label = stageRemainingLabel(state);
  if (label) return label;
  if (n <= 0) return "まもなく材料が揃います。";
  if (n === 1) return "あと 1 問で材料が揃います。";
  return `あと ${n} 問で材料が揃いそうです。`;
}

function estimateTotalQuestionCount(
  answeredCount: number,
  label: string | null,
  serverRemaining: number | null,
): number {
  const baseline = 5;
  if (serverRemaining !== null) {
    if (serverRemaining === 0) {
      return Math.max(answeredCount, baseline);
    }
    return Math.max(baseline, answeredCount + serverRemaining);
  }
  const grown = Math.max(baseline, answeredCount + 2);
  if (label && /整いました|揃いました|整理しています/.test(label)) {
    return Math.max(answeredCount, baseline);
  }
  return grown;
}

export function useGakuchikaViewModel(input: GakuchikaViewModelInput): GakuchikaViewModel {
  const { messages, conversationState, questionCount } = input;

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

  const serverRemaining = conversationState?.remainingQuestionsEstimate ?? null;
  const effectiveRemaining =
    typeof serverRemaining === "number" && Number.isFinite(serverRemaining) && serverRemaining >= 0
      ? Math.floor(serverRemaining)
      : null;

  const remainingLabel = useMemo(
    () =>
      effectiveRemaining !== null
        ? remainingLabelFromServerCount(conversationState, effectiveRemaining)
        : estimateRemainingQuestionsText(conversationState),
    [conversationState, effectiveRemaining],
  );

  const coachMessage = conversationState?.coachProgressMessage?.trim() ?? "";
  const primaryLine = coachMessage || remainingLabel || "";

  const estimatedTotal = useMemo(
    () => estimateTotalQuestionCount(answeredCount, remainingLabel, effectiveRemaining),
    [answeredCount, effectiveRemaining, remainingLabel],
  );

  const questionDisplay = useMemo(
    () =>
      answeredCount > 0
        ? `${Math.min(answeredCount, estimatedTotal)} 問目 / 約 ${estimatedTotal} 問`
        : "これから 1 問目",
    [answeredCount, estimatedTotal],
  );

  return {
    answeredCount,
    thinkingContextLabel,
    remainingLabel,
    primaryLine,
    estimatedTotal,
    questionDisplay,
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
