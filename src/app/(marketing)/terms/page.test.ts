import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("src/app/(marketing)/terms/page.tsx", "utf8");

describe("terms page legal regressions", () => {
  it("documents AI output rights and AI disclaimers", () => {
    expect(source).toContain("4-2. AI生成物の権利と責任");
    expect(source).toContain("4-3. AI機能の免責");
    expect(source).toContain("運営者独自の権利を主張しません");
    expect(source).toContain("著作物として保護されること");
    expect(source).toContain("選考");
    expect(source).toContain("専門的助言の代替ではありません");
  });

  it("keeps billing terms aligned with checkout and legal pages", () => {
    expect(source).toContain("id=\"billing\"");
    expect(source).toContain("税込価格");
    expect(source).toContain("Stripe");
    expect(source).toContain("自動更新");
    expect(source).toContain("申込時に即時決済");
    expect(source).toContain("更新日");
    expect(source).toContain("解約");
    expect(source).toContain("返金");
    expect(source).toContain("二重課金");
    expect(source).toContain("誤課金");
    expect(source).toContain("特定商取引法に基づく表記");
  });
});
