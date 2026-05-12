import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";

describe("CompanyInterviewPage", () => {
  it("uses feature-specific LoginRequiredForAi props", async () => {
    const source = await readFile(new URL("./page.tsx", import.meta.url), "utf8");
    expect(source).toContain("AI模擬面接で面接対策");
    expect(source).toContain("fallbackAction");
  });
});
