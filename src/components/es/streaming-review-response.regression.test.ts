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
    expect(source).toContain("visibleExplanationText");
    expect(source).toContain("explanationComplete");
    expect(source).not.toContain("top3");
  });
});
