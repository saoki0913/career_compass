import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";

describe("GakuchikaPage login gate", () => {
  it("uses feature-specific LoginRequiredForAi props", async () => {
    const source = await readFile(new URL("./page.tsx", import.meta.url), "utf8");
    expect(source).toContain("AIがガクチカを深掘りします");
    expect(source).toContain("fallbackAction");
  });

  it("renders the page header subtitle", async () => {
    const source = await readFile(new URL("./page.tsx", import.meta.url), "utf8");
    expect(source).toContain("AIとの会話でガクチカを作成できます");
  });
});
