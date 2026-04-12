import { describe, expect, it } from "vitest";

import { hydrateInterviewTurnStateFromRow, serializeInterviewTurnState } from "./adapters";
import type { InterviewTurnState } from "./types";

describe("interview adapters", () => {
  it("round-trips canonical turn state through serialize and hydrate", () => {
    const canonical: InterviewTurnState = {
      turnCount: 3,
      currentTopic: "motivation_fit",
      coverageState: [],
      coveredTopics: ["motivation_fit"],
      remainingTopics: ["company_compare"],
      recentQuestionSummariesV2: [],
      formatPhase: "standard_main",
      lastQuestion: "なぜ当社ですか。",
      lastAnswer: "事業と役割の接続があるからです。",
      lastTopic: "motivation_fit",
      currentTurnMeta: null,
      nextAction: "feedback",
    };

    const serialized = serializeInterviewTurnState(canonical);

    expect(hydrateInterviewTurnStateFromRow(serialized)).toEqual(canonical);
  });

  it("hydrates canonical turn state from legacy row fields", () => {
    const hydrated = hydrateInterviewTurnStateFromRow({
      currentStage: "company_compare",
      questionCount: 2,
      completedStages: ["motivation_fit"],
      lastQuestionFocus: "company_compare",
      questionFlowCompleted: false,
    });

    expect(hydrated.currentTopic).toBe("company_compare");
    expect(hydrated.turnCount).toBe(2);
    expect(hydrated.coveredTopics).toEqual(["motivation_fit"]);
    expect(hydrated.nextAction).toBe("ask");
  });
});
