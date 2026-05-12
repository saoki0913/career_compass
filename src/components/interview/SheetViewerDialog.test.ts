import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";

describe("SheetViewerDialog module", () => {
  it("exports SheetViewerDialog component", async () => {
    const source = await readFile(new URL("./SheetViewerDialog.tsx", import.meta.url), "utf8");
    expect(source).toContain("export function SheetViewerDialog");
  });

  it("uses SheetViewer inside a Dialog", async () => {
    const source = await readFile(new URL("./SheetViewerDialog.tsx", import.meta.url), "utf8");
    expect(source).toContain("SheetViewer");
    expect(source).toContain("Dialog");
    expect(source).toContain("DialogContent");
  });

  it("accepts InterviewSheetData or null with markdown fallback", async () => {
    const source = await readFile(new URL("./SheetViewerDialog.tsx", import.meta.url), "utf8");
    expect(source).toContain("InterviewSheetData");
    expect(source).toContain("markdownFallback");
  });

  it("shows satisfaction score selector", async () => {
    const source = await readFile(new URL("./SheetViewerDialog.tsx", import.meta.url), "utf8");
    expect(source).toContain("満足度");
    expect(source).toContain("onSaveSatisfaction");
  });

  it("includes print and PDF download buttons", async () => {
    const source = await readFile(new URL("./SheetViewerDialog.tsx", import.meta.url), "utf8");
    expect(source).toContain("window.print");
    expect(source).toContain("generateSheetPDF");
    expect(source).toContain("PDFをダウンロード");
  });
});
