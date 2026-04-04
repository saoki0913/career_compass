import { describe, expect, it } from "vitest";

import {
  safeParseInterviewFeedback,
  serializeInterviewTurnState,
} from "./conversation";

describe("interview conversation helpers", () => {
  it("parses v2.1 feedback linkage and satisfaction fields", () => {
    expect(
      safeParseInterviewFeedback(
        JSON.stringify({
          overall_comment: "総評",
          scores: { logic: 4 },
          strengths: ["構造化できている"],
          improvements: ["他社比較を補強する"],
          consistency_risks: ["将来像が浅い"],
          weakest_question_type: "motivation",
          weakest_turn_id: "turn-7",
          weakest_question_snapshot: "なぜ当社なのですか。",
          weakest_answer_snapshot: "事業に魅力を感じました。",
          improved_answer: "私は御社を志望する理由として...",
          next_preparation: ["他社比較の整理"],
          premise_consistency: 72,
          satisfaction_score: 4,
        }),
      ),
    ).toEqual({
      overall_comment: "総評",
      scores: { logic: 4 },
      strengths: ["構造化できている"],
      improvements: ["他社比較を補強する"],
      consistency_risks: ["将来像が浅い"],
      weakest_question_type: "motivation",
      weakest_turn_id: "turn-7",
      weakest_question_snapshot: "なぜ当社なのですか。",
      weakest_answer_snapshot: "事業に魅力を感じました。",
      improved_answer: "私は御社を志望する理由として...",
      next_preparation: ["他社比較の整理"],
      premise_consistency: 72,
      satisfaction_score: 4,
    });
  });

  it("serializes v2.1 turn state without relying on legacy completedStages as source of truth", () => {
    expect(
      serializeInterviewTurnState({
        turnCount: 4,
        currentTopic: "motivation_fit",
        coverageState: [
          {
            topic: "motivation_fit",
            status: "covered",
            requiredChecklist: ["company_reason", "experience_link"],
            passedChecklistKeys: ["company_reason", "experience_link"],
            deterministicCoveragePassed: true,
            llmCoverageHint: "strong",
            deepeningCount: 2,
            lastCoveredTurnId: "turn-4",
          },
        ],
        coveredTopics: ["motivation_fit"],
        remainingTopics: ["company_compare"],
        recentQuestionSummariesV2: [],
        formatPhase: "standard_main",
        lastQuestion: "なぜ当社なのですか。",
        lastAnswer: "事業投資を通じて価値を作りたいからです。",
        lastTopic: "motivation_fit",
        currentTurnMeta: null,
        nextAction: "feedback",
      }),
    ).toMatchObject({
      currentStage: "motivation_fit",
      questionCount: 4,
      questionFlowCompleted: true,
      turnStateJson: expect.any(String),
    });
  });
});
