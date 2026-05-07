import { describe, expect, it } from "vitest";

import { getDefaultConversationState } from "@/lib/gakuchika/conversation-state";
import { createGakuchikaStreamStateMachine } from "./stream-state-machine";

describe("createGakuchikaStreamStateMachine", () => {
  it("suppresses early focus/progress fields but forwards coach hydration fields", () => {
    const machine = createGakuchikaStreamStateMachine(getDefaultConversationState());

    expect(machine.processEvent({ type: "field_complete", path: "focus_key", value: "task" })).toEqual({
      suppress: true,
      emitExtra: undefined,
    });
    expect(machine.processEvent({ type: "field_complete", path: "progress_label", value: "課題を整理中" })).toEqual({
      suppress: true,
      emitExtra: undefined,
    });
    expect(machine.processEvent({
      type: "field_complete",
      path: "coach_progress_message",
      value: "あと1問で材料が揃いそうです。",
    })).toEqual({
      suppress: false,
      emitExtra: [{
        type: "field_complete",
        path: "coach_progress_message",
        value: "あと1問で材料が揃いそうです。",
      }],
    });
  });
});
