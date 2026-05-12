import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";

describe("MotivationConversationPage", () => {
  it("uses feature-specific LoginRequiredForAi props", async () => {
    const source = await readFile(new URL("./page.tsx", import.meta.url), "utf8");
    expect(source).toContain("AIが志望動機の下書きを作成します");
    expect(source).toContain("fallbackAction");
  });
});
