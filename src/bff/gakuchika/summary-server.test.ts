import { describe, expect, it } from "vitest";

describe("bff/gakuchika/summary-server", () => {
  it("uses structured logError instead of console.error for error logging", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile(new URL("./summary-server.ts", import.meta.url), "utf8");
    expect(source).toContain('import { logError } from "@/lib/logger"');
    expect(source).toContain('logError("gakuchika-summary:consume-credits"');
    expect(source).not.toMatch(/console\.error\(/);
  });

  it("exposes a source discriminator so the paid path bills only LLM-generated summaries", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile(new URL("./summary-server.ts", import.meta.url), "utf8");
    // 戻り値型に source 判別子を含む（課金は source === "llm" のときのみ）
    expect(source).toMatch(/source:\s*"llm"\s*\|\s*"fallback"/);
    // LLM 構造化サマリ成功経路は課金対象
    expect(source).toContain('source: "llm"');
    // fallback 経路は非課金にすべき
    expect(source).toContain('source: "fallback"');
  });
});
