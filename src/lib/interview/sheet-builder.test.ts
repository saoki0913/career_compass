import { describe, expect, it } from "vitest";

import { buildInterviewSheetMarkdown, type SheetBuildInput } from "./sheet-builder";

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
