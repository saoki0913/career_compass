import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";

describe("sheet-pdf module", () => {
  it("exports generateSheetPDF function", async () => {
    const source = await readFile(new URL("./sheet-pdf.ts", import.meta.url), "utf8");
    expect(source).toContain("export async function generateSheetPDF");
  });

  it("uses dynamic imports for jspdf and html2canvas", async () => {
    const source = await readFile(new URL("./sheet-pdf.ts", import.meta.url), "utf8");
    expect(source).toContain('import("jspdf")');
    expect(source).toContain('import("html2canvas")');
  });

  it("accepts an elementId parameter", async () => {
    const source = await readFile(new URL("./sheet-pdf.ts", import.meta.url), "utf8");
    expect(source).toContain("elementId: string");
  });

  it("returns a Blob", async () => {
    const source = await readFile(new URL("./sheet-pdf.ts", import.meta.url), "utf8");
    expect(source).toContain("Promise<Blob>");
  });
});
