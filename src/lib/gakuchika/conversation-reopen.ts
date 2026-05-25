import {
  buildConversationStatePatch,
  getGakuchikaNextAction,
  type ConversationState,
} from "@/lib/gakuchika/conversation-state";

export function reopenGakuchikaConversationState(state: ConversationState): ConversationState {
  if (getGakuchikaNextAction(state) === "ask") return state;

  if (state.stage === "interview_ready") {
    return buildConversationStatePatch(state, {
      stage: "deep_dive_active",
      deepdiveComplete: false,
      deepdiveStage: "es_aftercare",
      progressLabel: "さらに深掘り中",
      pausedQuestion: null,
      summaryStale: true,
      extendedDeepDiveRound: (state.extendedDeepDiveRound ?? 0) + 1,
    });
  }

  if (state.stage === "draft_ready" && state.draftText) {
    return buildConversationStatePatch(state, {
      stage: "deep_dive_active",
      deepdiveComplete: false,
      deepdiveStage: "es_aftercare",
      progressLabel: "深掘り中",
      pausedQuestion: null,
      summaryStale: true,
    });
  }

  if (state.stage === "draft_ready") {
    return buildConversationStatePatch(state, {
      stage: "es_building",
      readyForDraft: true,
      deepdiveComplete: false,
      deepdiveStage: null,
      progressLabel: "追加で整理中",
      pausedQuestion: null,
    });
  }

  return buildConversationStatePatch(state, { pausedQuestion: null });
}
