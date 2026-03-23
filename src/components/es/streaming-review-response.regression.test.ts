import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();

function readSource(relativePath: string) {
  return readFileSync(path.join(repoRoot, relativePath), "utf8");
}

describe("streaming review response regressions", () => {
  it("does not keep animated issue/source wrappers during streaming", () => {
    const source = readSource("src/components/es/StreamingReviewResponse.tsx");

    expect(source).not.toContain("AnimatePresence");
    expect(source).not.toContain("motion.article");
    expect(source).not.toContain("motion.div");
  });
});
