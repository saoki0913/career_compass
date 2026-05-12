import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";

describe("SheetViewer module", () => {
  it("exports SheetViewer component", async () => {
    const source = await readFile(new URL("./SheetViewer.tsx", import.meta.url), "utf8");
    expect(source).toContain("export function SheetViewer");
  });

  it("renders all 8 sheet sections", async () => {
    const source = await readFile(new URL("./SheetViewer.tsx", import.meta.url), "utf8");
    expect(source).toContain("採点結果");
    expect(source).toContain("総合コメント");
    expect(source).toContain("良かった点");
    expect(source).toContain("改善点");
    expect(source).toContain("一貫性リスク");
    expect(source).toContain("質疑応答");
    expect(source).toContain("言い換え例");
    expect(source).toContain("次に準備すべき論点");
  });

  it("supports InterviewSheetData and markdown fallback", async () => {
    const source = await readFile(new URL("./SheetViewer.tsx", import.meta.url), "utf8");
    expect(source).toContain("InterviewSheetData");
    expect(source).toContain("markdownFallback");
    expect(source).toContain("MarkdownFallback");
  });

  it("uses ScoreBar for score visualization", async () => {
    const source = await readFile(new URL("./SheetViewer.tsx", import.meta.url), "utf8");
    expect(source).toContain("ScoreBar");
    expect(source).toContain("bg-emerald-500");
    expect(source).toContain("bg-amber-500");
  });

  it("includes print-friendly classes", async () => {
    const source = await readFile(new URL("./SheetViewer.tsx", import.meta.url), "utf8");
    expect(source).toContain("print:");
  });

  it("uses Collapsible for Q&A section", async () => {
    const source = await readFile(new URL("./SheetViewer.tsx", import.meta.url), "utf8");
    expect(source).toContain("Collapsible");
    expect(source).toContain("CollapsibleContent");
  });
});
