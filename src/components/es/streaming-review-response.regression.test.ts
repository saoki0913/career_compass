import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();

function readSource(relativePath: string) {
  return readFileSync(path.join(repoRoot, relativePath), "utf8");
}

describe("streaming review response regressions", () => {
  it("keeps the explanation block simple without animated wrappers", () => {
    const source = readSource("src/components/es/StreamingReviewResponse.tsx");

    expect(source).not.toContain("AnimatePresence");
    expect(source).not.toContain("motion.article");
    expect(source).not.toContain("motion.div");
    expect(source).toContain("改善ポイント");
    expect(source).toContain("主な変更点");
    expect(source).not.toContain("改善の理由");
    expect(source).toContain("parseImprovementExplanation");
    expect(source).toContain("visibleExplanationText");
    expect(source).toContain("explanationComplete");
    expect(source).not.toContain("source_id");
    expect(source).not.toContain("requestId");
    expect(source).not.toContain("rewrite_attempt_count");
    expect(source).not.toContain("repair_dispatches");
    expect(source).toContain("SimpleMarkdownText");
    expect(source).toContain("@/lib/simple-markdown");
    expect(source).not.toContain("react-markdown");
    expect(source).not.toContain("dangerouslySetInnerHTML");
    expect(source).not.toContain("top3");
  });

  it("presents submission checks without pass/fail-like score grades", () => {
    const source = readSource("src/components/es/StreamingReviewResponse.tsx");

    expect(source).toContain("提出前チェック");
    expect(source).toContain("確認済み");
    expect(source).toContain("要確認");
    expect(source).toContain("根拠不足");
    expect(source).toContain("根拠制約");
    expect(source).not.toContain("品質スコア");
    expect(source).not.toContain("QualityGrade");
    expect(source).not.toContain("GRADE_COLORS");
    expect(source).not.toMatch(/["']S["']|["']A["']|["']B["']|["']C["']/);
  });
});
