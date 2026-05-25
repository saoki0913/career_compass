import { describe, expect, it } from "vitest";

import {
  motivationFeedbackHasVisibleContent,
  parseMotivationFeedbackSummary,
  type MotivationFeedbackSummary,
} from "./feedback-summary";

describe("motivation/feedback-summary", () => {
  it("parses a full summary object", () => {
    const parsed = parseMotivationFeedbackSummary({
      one_line_core_answer: "核となる志望",
      strengths: [{ title: "強み", description: "説明" }],
      improvements: [{ title: "改善", description: "説明" }],
      next_preparation: ["準備すること"],
      likely_followup_questions: ["想定質問"],
    });
    expect(parsed?.one_line_core_answer).toBe("核となる志望");
    expect(parsed?.strengths[0].title).toBe("強み");
    expect(parsed?.improvements[0]).toEqual({ title: "改善", description: "説明" });
    expect(parsed?.next_preparation).toEqual(["準備すること"]);
  });

  it("promotes plain-string point items to {title, description:''}", () => {
    const parsed = parseMotivationFeedbackSummary({
      one_line_core_answer: "核",
      strengths: ["文字列の強み"],
    });
    expect(parsed?.strengths[0]).toEqual({ title: "文字列の強み", description: "" });
  });

  it("parses a JSON string input", () => {
    const parsed = parseMotivationFeedbackSummary(
      JSON.stringify({ one_line_core_answer: "核", strengths: [] }),
    );
    expect(parsed?.one_line_core_answer).toBe("核");
  });

  it("returns null for empty or invalid content", () => {
    expect(
      parseMotivationFeedbackSummary({ one_line_core_answer: "", strengths: [] }),
    ).toBeNull();
    expect(parseMotivationFeedbackSummary(null)).toBeNull();
    expect(parseMotivationFeedbackSummary("not json at all")).toBeNull();
  });

  it("detects visible content", () => {
    const empty: MotivationFeedbackSummary = {
      one_line_core_answer: "",
      strengths: [],
      improvements: [],
      next_preparation: [],
      likely_followup_questions: [],
    };
    expect(motivationFeedbackHasVisibleContent(empty)).toBe(false);
    expect(
      motivationFeedbackHasVisibleContent({ ...empty, likely_followup_questions: ["Q"] }),
    ).toBe(true);
  });
});
