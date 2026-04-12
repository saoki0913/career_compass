import { describe, expect, it } from "vitest";

import { DEFAULT_MOTIVATION_CONTEXT } from "./types";
import { safeParseConversationContext, safeParseStageStatus, serializeConversationContext } from "./adapters";

describe("motivation adapters", () => {
  it("round-trips canonical conversation context through serialize and parse", () => {
    const canonical = safeParseConversationContext({
      ...DEFAULT_MOTIVATION_CONTEXT,
      questionStage: "desired_work" as const,
      selectedIndustry: "物流",
      selectedRole: "総合職",
      draftReady: true,
    });

    expect(safeParseConversationContext(serializeConversationContext(canonical))).toEqual(canonical);
  });

  it("derives stage status from parsed canonical context", () => {
    const canonical = safeParseConversationContext({
      questionStage: "value_contribution",
      confirmedFacts: {
        industry_reason_confirmed: true,
        company_reason_confirmed: true,
        self_connection_confirmed: true,
        desired_work_confirmed: true,
        value_contribution_confirmed: false,
        differentiation_confirmed: false,
      },
    });

    expect(safeParseStageStatus(null, canonical)).toEqual({
      current: "value_contribution",
      completed: ["industry_reason", "company_reason", "self_connection", "desired_work"],
      pending: ["differentiation"],
    });
  });
});
