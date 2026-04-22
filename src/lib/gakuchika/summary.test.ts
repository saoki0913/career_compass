import { describe, expect, it } from "vitest";
import { parseGakuchikaSummary } from "@/lib/gakuchika/summary";

describe("gakuchika summary", () => {
  it("parses interview prep pack fields from structured summary", () => {
    const parsed = parseGakuchikaSummary({
      situation_text: "学園祭実行委員として受付改善に取り組んだ。",
      task_text: "来場直後の混雑を解消する必要があった。",
      action_text: "導線変更と役割分担の見直しを行った。",
      result_text: "待機列が短縮し、案内負荷も下がった。",
      strengths: [{ title: "現場再設計", description: "混雑を構造で解消" }],
      learnings: [{ title: "役割再配置", description: "状況で役割を切る" }],
      one_line_core_answer: "混雑時に導線を再設計して受付体験を改善した経験です。",
      likely_followup_questions: ["なぜ導線変更を選んだのか"],
      weak_points_to_prepare: ["成果の比較対象を整理する"],
      two_minute_version_outline: ["背景", "課題", "打ち手", "成果", "学び"],
    });

    expect(parsed).not.toBeNull();
    expect(parsed && "one_line_core_answer" in parsed ? parsed.one_line_core_answer : null).toBe(
      "混雑時に導線を再設計して受付体験を改善した経験です。",
    );
    expect(
      parsed && "likely_followup_questions" in parsed ? parsed.likely_followup_questions : [],
    ).toEqual(["なぜ導線変更を選んだのか"]);
    expect(parsed && "weak_points_to_prepare" in parsed ? parsed.weak_points_to_prepare : []).toEqual([
      "成果の比較対象を整理する",
    ]);
    expect(parsed && "two_minute_version_outline" in parsed ? parsed.two_minute_version_outline : []).toEqual([
      "背景",
      "課題",
      "打ち手",
      "成果",
      "学び",
    ]);
  });
});
