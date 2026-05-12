import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";

describe("InterviewDashboardPage", () => {
  it("uses feature-specific LoginRequiredForAi props", async () => {
    const source = await readFile(new URL("./page.tsx", import.meta.url), "utf8");
    expect(source).toContain("面接の成長を可視化");
    expect(source).toContain("fallbackAction");
  });
});
