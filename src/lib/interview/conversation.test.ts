import { describe, expect, it } from "vitest";

import {
  parseInterviewPlanJson,
  safeParseInterviewFeedback,
  safeParseInterviewMessages,
  serializeInterviewPlan,
  serializeInterviewTurnState,
} from "./conversation";
import { normalizeInterviewPlanValue } from "./plan";

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
          score_evidence_by_axis: { logic: ["順序立てて説明"] },
          score_rationale_by_axis: { logic: "構成は明確です。" },
          confidence_by_axis: { logic: "medium" },
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
      score_evidence_by_axis: { logic: ["順序立てて説明"] },
      score_rationale_by_axis: { logic: "構成は明確です。" },
      confidence_by_axis: { logic: "medium" },
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
      turnStateJson: expect.any(Object),
    });
  });

  it("parses jsonb-backed message arrays directly", () => {
    expect(
      safeParseInterviewMessages([
        { role: "user", content: "回答" },
        { role: "assistant", content: "質問" },
      ]),
    ).toEqual([
      { role: "user", content: "回答" },
      { role: "assistant", content: "質問" },
    ]);
  });

  it("round-trips system-owned interview plan fields as camelCase", () => {
    const normalized = normalizeInterviewPlanValue({
      interview_type: "case",
      priority_topics: ["structured_thinking"],
      opening_topic: "structured_thinking",
      must_cover_topics: ["structured_thinking", "prioritization"],
      risk_topics: ["logic"],
      suggested_timeflow: ["導入", "構造化"],
      case_brief: {
        business_context: "金融サービスの若年層利用率を改善する",
        target_metric: "monthly_active_users",
        constraints: ["追加予算なし"],
        candidate_task: "施策を優先順位づける",
        why_this_company: "金融とUXの接点を見るため",
        case_followup_topics: ["segmentation", "tradeoff"],
        industry: "finance",
        case_seed_version: "v1.0",
      },
      quality_lenses: ["logic", "specificity"],
      contract_version: "interview-plan-v2",
      plan_source: "fastapi",
      fallback_reason: "case_brief_preset",
    });

    expect(normalized).toMatchObject({
      interviewType: "case",
      caseBrief: {
        business_context: "金融サービスの若年層利用率を改善する",
        case_seed_version: "v1.0",
      },
      qualityLenses: ["logic", "specificity"],
      contractVersion: "interview-plan-v2",
      planSource: "fastapi",
      fallbackReason: "case_brief_preset",
    });

    const serialized = serializeInterviewPlan(normalized);
    expect(serialized).toEqual(normalized);
    expect(serialized).not.toHaveProperty("case_brief");
    expect(serialized).not.toHaveProperty("quality_lenses");

    expect(parseInterviewPlanJson(JSON.stringify(serialized))).toEqual(normalized);
  });
});
