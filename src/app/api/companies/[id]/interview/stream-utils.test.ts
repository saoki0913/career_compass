import { describe, expect, it } from "vitest";

import { normalizeFeedback } from "./stream-utils";

describe("interview stream utils", () => {
  it("normalizes v2.1 feedback linkage fields from upstream payload", () => {
    expect(
      normalizeFeedback({
        overall_comment: "総評",
        scores: { logic: 4 },
        strengths: ["構造化"],
        improvements: ["比較軸"],
        consistency_risks: ["将来像が浅い"],
        weakest_question_type: "motivation",
        weakest_turn_id: "turn-3",
        weakest_question_snapshot: "なぜ当社なのですか。",
        weakest_answer_snapshot: "事業に魅力を感じたからです。",
        improved_answer: "改善回答",
        next_preparation: ["比較軸の整理"],
        premise_consistency: 77,
        satisfaction_score: 4,
      }),
    ).toEqual({
      overall_comment: "総評",
      scores: { logic: 4 },
      strengths: ["構造化"],
      improvements: ["比較軸"],
      consistency_risks: ["将来像が浅い"],
      weakest_question_type: "motivation",
      weakest_turn_id: "turn-3",
      weakest_question_snapshot: "なぜ当社なのですか。",
      weakest_answer_snapshot: "事業に魅力を感じたからです。",
      improved_answer: "改善回答",
      next_preparation: ["比較軸の整理"],
      premise_consistency: 77,
      satisfaction_score: 4,
    });
  });
});
