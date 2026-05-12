import { describe, expect, it } from "vitest";

import { buildInterviewSheetData, buildInterviewSheetMarkdown, type SheetBuildInput } from "./sheet-builder";

function buildInput(overrides: Partial<SheetBuildInput> = {}): SheetBuildInput {
  return {
    companyName: "テスト株式会社",
    setup: {
      interviewFormat: "standard_behavioral",
      selectionType: "fulltime",
      interviewStage: "mid",
      interviewerType: "hr",
      strictnessMode: "standard",
    },
    selectedRole: "フロントエンドエンジニア",
    messages: [
      { role: "assistant", content: "志望動機を教えてください。" },
      { role: "user", content: "御社のプロダクトに共感しています。" },
      { role: "assistant", content: "具体的にどのような点ですか？" },
      { role: "user", content: "ユーザー体験へのこだわりです。" },
    ],
    feedback: {
      overall_comment: "論理的に回答できていますが、具体性が不足しています。",
      scores: { company_fit: 4, role_fit: 3, specificity: 2, logic: 4, persuasiveness: 3, consistency: 4, credibility: 3 },
      strengths: ["構造化された回答", "一貫したストーリー"],
      improvements: ["具体的な数字", "他社比較"],
      consistency_risks: ["将来像と現在の活動に乖離"],
      weakest_question_type: "motivation",
      weakest_turn_id: null,
      weakest_question_snapshot: null,
      weakest_answer_snapshot: null,
      improved_answer: "御社のプロダクトの中でも特にXの機能に共感しており...",
      next_preparation: ["企業研究の深掘り", "業界比較の準備"],
    },
    generatedAt: new Date("2026-05-11T10:00:00+09:00"),
    ...overrides,
  };
}

describe("buildInterviewSheetMarkdown", () => {
  it("includes company name in header", () => {
    const md = buildInterviewSheetMarkdown(buildInput());
    expect(md).toContain("テスト株式会社");
  });

  it("includes interview setup section", () => {
    const md = buildInterviewSheetMarkdown(buildInput());
    expect(md).toContain("通常面接");
    expect(md).toContain("本選考");
    expect(md).toContain("二次 / 中盤");
    expect(md).toContain("人事");
    expect(md).toContain("標準");
    expect(md).toContain("フロントエンドエンジニア");
  });

  it("includes Q&A pairs numbered", () => {
    const md = buildInterviewSheetMarkdown(buildInput());
    expect(md).toContain("Q1");
    expect(md).toContain("志望動機を教えてください。");
    expect(md).toContain("A1");
    expect(md).toContain("御社のプロダクトに共感しています。");
    expect(md).toContain("Q2");
    expect(md).toContain("A2");
  });

  it("includes score table", () => {
    const md = buildInterviewSheetMarkdown(buildInput());
    expect(md).toContain("企業適合");
    expect(md).toContain("4/5");
    expect(md).toContain("具体性");
    expect(md).toContain("2/5");
  });

  it("includes strengths and improvements", () => {
    const md = buildInterviewSheetMarkdown(buildInput());
    expect(md).toContain("構造化された回答");
    expect(md).toContain("具体的な数字");
  });

  it("includes improved answer", () => {
    const md = buildInterviewSheetMarkdown(buildInput());
    expect(md).toContain("御社のプロダクトの中でも特にXの機能に共感しており");
  });

  it("includes next preparation", () => {
    const md = buildInterviewSheetMarkdown(buildInput());
    expect(md).toContain("企業研究の深掘り");
    expect(md).toContain("業界比較の準備");
  });

  it("includes consistency risks when present", () => {
    const md = buildInterviewSheetMarkdown(buildInput());
    expect(md).toContain("将来像と現在の活動に乖離");
  });

  it("omits consistency risks section when empty", () => {
    const input = buildInput();
    input.feedback.consistency_risks = [];
    const md = buildInterviewSheetMarkdown(input);
    expect(md).not.toContain("一貫性リスク");
  });

  it("handles null selectedRole gracefully", () => {
    const md = buildInterviewSheetMarkdown(buildInput({ selectedRole: null }));
    expect(md).toContain("未設定");
  });

  it("handles empty messages", () => {
    const md = buildInterviewSheetMarkdown(buildInput({ messages: [] }));
    expect(md).not.toContain("Q1");
  });
});

describe("buildInterviewSheetData", () => {
  it("produces a valid structured sheet object", () => {
    const result = buildInterviewSheetData(buildInput());

    expect(result.companyName).toBe("テスト株式会社");
    expect(result.selectedRole).toBe("フロントエンドエンジニア");
    expect(typeof result.generatedAt).toBe("string");
  });

  it("builds setup section with display labels", () => {
    const result = buildInterviewSheetData(buildInput());

    expect(result.setup.interviewFormat).toBe("通常面接");
    expect(result.setup.selectionType).toBe("本選考");
    expect(result.setup.interviewStage).toBe("二次 / 中盤");
    expect(result.setup.interviewerType).toBe("人事");
    expect(result.setup.strictnessMode).toBe("標準");
  });

  it("builds score entries with evidence and rationale", () => {
    const input = buildInput();
    input.feedback.score_evidence_by_axis = { company_fit: ["DX推進への言及"] };
    input.feedback.score_rationale_by_axis = { company_fit: "事業理解がある" };
    input.feedback.confidence_by_axis = { company_fit: "high" };

    const result = buildInterviewSheetData(input);
    expect(result.scores).toHaveLength(7);

    const companyFit = result.scores.find((s) => s.axis === "企業適合");
    expect(companyFit).toBeDefined();
    expect(companyFit!.score).toBe(4);
    expect(companyFit!.evidence).toEqual(["DX推進への言及"]);
    expect(companyFit!.rationale).toBe("事業理解がある");
    expect(companyFit!.confidence).toBe("high");
  });

  it("builds Q&A pairs from messages", () => {
    const result = buildInterviewSheetData(buildInput());

    expect(result.qaPairs).toHaveLength(2);
    expect(result.qaPairs[0].question).toBe("志望動機を教えてください。");
    expect(result.qaPairs[0].answer).toBe("御社のプロダクトに共感しています。");
    expect(result.qaPairs[1].question).toBe("具体的にどのような点ですか？");
    expect(result.qaPairs[1].answer).toBe("ユーザー体験へのこだわりです。");
  });

  it("includes feedback sections", () => {
    const result = buildInterviewSheetData(buildInput());

    expect(result.overallComment).toBe("論理的に回答できていますが、具体性が不足しています。");
    expect(result.strengths).toEqual(["構造化された回答", "一貫したストーリー"]);
    expect(result.improvements).toEqual(["具体的な数字", "他社比較"]);
    expect(result.consistencyRisks).toEqual(["将来像と現在の活動に乖離"]);
    expect(result.improvedAnswer).toBe("御社のプロダクトの中でも特にXの機能に共感しており...");
    expect(result.nextPreparation).toEqual(["企業研究の深掘り", "業界比較の準備"]);
  });

  it("includes weakest question info with label", () => {
    const input = buildInput();
    input.feedback.weakest_question_snapshot = "志望動機を教えてください。";
    input.feedback.weakest_answer_snapshot = "成長性に惹かれました。";

    const result = buildInterviewSheetData(input);
    expect(result.weakestQuestion).toBeDefined();
    expect(result.weakestQuestion!.questionType).toBe("志望動機");
    expect(result.weakestQuestion!.question).toBe("志望動機を教えてください。");
    expect(result.weakestQuestion!.answer).toBe("成長性に惹かれました。");
  });

  it("handles null weakest question fields", () => {
    const input = buildInput();
    input.feedback.weakest_question_type = null;
    input.feedback.weakest_question_snapshot = null;
    input.feedback.weakest_answer_snapshot = null;

    const result = buildInterviewSheetData(input);
    expect(result.weakestQuestion).toBeNull();
  });

  it("handles empty messages", () => {
    const result = buildInterviewSheetData(buildInput({ messages: [] }));
    expect(result.qaPairs).toEqual([]);
  });

  it("handles missing score evidence gracefully", () => {
    const input = buildInput();
    delete input.feedback.score_evidence_by_axis;
    delete input.feedback.score_rationale_by_axis;
    delete input.feedback.confidence_by_axis;

    const result = buildInterviewSheetData(input);
    const companyFit = result.scores.find((s) => s.axis === "企業適合");
    expect(companyFit!.evidence).toEqual([]);
    expect(companyFit!.rationale).toBeNull();
    expect(companyFit!.confidence).toBeNull();
  });
});
