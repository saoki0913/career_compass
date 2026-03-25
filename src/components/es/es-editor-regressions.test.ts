import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();

function readSource(relativePath: string) {
  return readFileSync(path.join(repoRoot, relativePath), "utf8");
}

describe("ES editor regressions", () => {
  it("does not show the editing lock banner text anymore", () => {
    const source = readSource("src/components/es/ESEditorPageClient.tsx");

    expect(source).not.toContain("完了まで本文の編集はできません");
  });

  it("keeps the editor read-only while a review is running", () => {
    const source = readSource("src/components/es/ESEditorPageClient.tsx");

    expect(source).toContain("readOnly={isLocked}");
  });

  it("removes the review history panel and completion persistence hook-up", () => {
    const editorSource = readSource("src/components/es/ESEditorPageClient.tsx");
    const reviewPanelSource = readSource("src/components/es/ReviewPanel.tsx");
    const mobilePanelSource = readSource("src/components/es/MobileReviewPanel.tsx");
    const hookSource = readSource("src/hooks/useESReview.ts");

    expect(editorSource).not.toContain("ReviewThreadsPanel");
    expect(editorSource).not.toContain("buildReviewThreadPostBody");
    expect(reviewPanelSource).not.toContain("onReviewComplete");
    expect(mobilePanelSource).not.toContain("onReviewComplete");
    expect(hookSource).not.toContain("onReviewComplete");
  });
});
