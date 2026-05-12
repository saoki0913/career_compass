import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";

describe("DraftPreviewModal", () => {
  it("exports DraftPreviewModal component", async () => {
    const source = await readFile(new URL("./DraftPreviewModal.tsx", import.meta.url), "utf8");
    expect(source).toContain("DraftPreviewModal");
  });

  it("supports optional draftQuality and deepDiveConfirm props", async () => {
    const source = await readFile(new URL("./DraftPreviewModal.tsx", import.meta.url), "utf8");
    expect(source).toContain("draftQuality?:");
    expect(source).toContain("deepDiveConfirm?:");
  });

  it("uses Dialog for desktop and Sheet for mobile", async () => {
    const source = await readFile(new URL("./DraftPreviewModal.tsx", import.meta.url), "utf8");
    expect(source).toContain("Dialog");
    expect(source).toContain("Sheet");
    expect(source).toContain("useMediaQuery");
  });

  it("uses expanded modal size for better readability", async () => {
    const source = await readFile(new URL("./DraftPreviewModal.tsx", import.meta.url), "utf8");
    expect(source).toContain("max-w-7xl");
    expect(source).toContain("max-h-[min(94vh,960px)]");
    expect(source).not.toContain("max-w-6xl");
  });
});
