"use client";

import type { ConversationStreamAdapter } from "@/hooks/conversation";
import { streamMotivationConversation } from "@/features/motivation/application/client-api";
import type {
  CausalGap,
  ConversationMode,
  EvidenceCard,
  MotivationMessage,
  MotivationProgress,
  MotivationStageKey,
  StageStatus,
} from "@/features/motivation/domain/ui";

export type MotivationDomainState = {
  messages: MotivationMessage[];
  nextQuestion: string | null;
  questionCount: number;
  isDraftReady: boolean;
  draftReadyJustUnlocked: boolean;
  evidenceSummary: string | null;
  evidenceCards: EvidenceCard[];
  userEvidenceCards: EvidenceCard[];
  questionStage: MotivationStageKey | null;
  stageStatus: StageStatus | null;
  coachingFocus: string | null;
  conversationMode: ConversationMode;
  currentSlot: Exclude<MotivationStageKey, "closing"> | null;
  currentIntent: string | null;
  nextAdvanceCondition: string | null;
  progress: MotivationProgress | null;
  causalGaps: CausalGap[];
};

function withIds(
  messages: Array<{ role: "user" | "assistant"; content: string; id?: string }>,
): MotivationMessage[] {
  return messages.map((message, index) => ({
    ...message,
    id: message.id || `msg-${index}`,
  }));
}

function toMotivationDomainState(data: Record<string, unknown>): MotivationDomainState {
  return {
    messages: withIds(
      (data.messages as Array<{ role: "user" | "assistant"; content: string; id?: string }>) || [],
    ),
    nextQuestion: (data.nextQuestion as string) ?? null,
    questionCount: (data.questionCount as number) || 0,
    isDraftReady: (data.isDraftReady as boolean) || false,
    draftReadyJustUnlocked: (data.draftReadyJustUnlocked as boolean) || false,
    evidenceSummary: (data.evidenceSummary as string) || null,
    evidenceCards: (data.evidenceCards as EvidenceCard[]) || [],
    userEvidenceCards: (data.userEvidenceCards as EvidenceCard[]) || [],
    questionStage: (data.questionStage as MotivationStageKey) || null,
    stageStatus: (data.stageStatus as StageStatus) || null,
    coachingFocus: (data.coachingFocus as string) || null,
    conversationMode: (data.conversationMode as ConversationMode) || "slot_fill",
    currentSlot: (data.currentSlot as Exclude<MotivationStageKey, "closing">) || null,
    currentIntent: (data.currentIntent as string) || null,
    nextAdvanceCondition: (data.nextAdvanceCondition as string) || null,
    progress: (data.progress as MotivationProgress) || null,
    causalGaps: (data.causalGaps as CausalGap[]) || [],
  };
}

export function createMotivationStreamAdapter(deps: {
  companyId: string;
  commitState: (state: MotivationDomainState) => void;
  onError: (error: unknown, originalAnswer: string) => void;
}): ConversationStreamAdapter<MotivationDomainState, MotivationMessage, void> {
  return {
    createStreamContext: () => undefined,
    fetchStream: (answer, signal) =>
      streamMotivationConversation(
        deps.companyId,
        { answer },
        signal ?? new AbortController().signal,
      ),
    buildOptimisticMessage: (id, content) => ({
      id,
      role: "user",
      content,
      isOptimistic: true,
    }),
    processSSEEvent: (event, context) => {
      if (event.type === "progress") {
        return {
          action: "set_progress",
          label: (event.label as string) || null,
          context,
        };
      }

      if (event.type === "complete") {
        const domainState = toMotivationDomainState(event.data as Record<string, unknown>);
        return {
          action: "complete",
          domainState,
          playbackText: domainState.nextQuestion?.trim() || "",
          context,
        };
      }

      if (event.type === "error") {
        return {
          action: "error",
          message: (event.message as string) || "AIサービスでエラーが発生しました",
          context,
        };
      }

      return { action: "noop", context };
    },
    getPlaybackText: (state) => state.nextQuestion?.trim() || "",
    commitState: deps.commitState,
    onError: deps.onError,
    errorMeta: {
      code: "MOTIVATION_CONVERSATION_STREAM_FAILED",
      userMessage: "送信に失敗しました。",
      action: "時間を置いて、もう一度お試しください。",
      retryable: true,
      logContext: "MotivationPage.handleSend",
    },
    useStreamTimeout: true,
  };
}
