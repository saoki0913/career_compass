import { describe, expect, it } from "vitest";

// shared.ts は db を import するため、balance.test.ts と同じく静的ソース解析で
// 型・定数の宣言を検証し、テスト時の db 接続ロードを回避する。
describe("credits/shared", () => {
  it("declares motivation_summary and gakuchika_summary transaction types", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile(new URL("./shared.ts", import.meta.url), "utf8");
    expect(source).toContain('"motivation_summary"');
    expect(source).toContain('"gakuchika_summary"');
  });

  it("bills feedback summary generation at 6 credits (success-only consumption)", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile(new URL("./shared.ts", import.meta.url), "utf8");
    expect(source).toContain("FEEDBACK_SUMMARY_CREDIT_COST = 6");
  });
});
