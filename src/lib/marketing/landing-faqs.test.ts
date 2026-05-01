import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { LANDING_PAGE_FAQS } from "./landing-faqs";

const repoRoot = process.cwd();

function readSource(relativePath: string) {
  return readFileSync(path.join(repoRoot, relativePath), "utf8");
}

describe("landing-faqs data guard", () => {
  const source = readSource("src/lib/marketing/landing-faqs.ts");

  it("exports LANDING_PAGE_FAQS with 10 FAQ entries", () => {
    expect(source).toContain("LANDING_PAGE_FAQS");
    const faqEntries = source.match(/question:\s*"/g);
    expect(faqEntries).not.toBeNull();
    expect(faqEntries!.length).toBe(10);
    expect(LANDING_PAGE_FAQS).toHaveLength(10);
    for (const faq of LANDING_PAGE_FAQS) {
      expect(faq.question.trim()).toBe(faq.question);
      expect(faq.question.length).toBeGreaterThan(0);
      expect(faq.answer.length).toBeGreaterThan(0);
    }
  });

  it("covers first-time user concerns before feature detail", () => {
    expect(source).toContain("無料でどこまで使えますか？");
    expect(source).toContain("クレジットはいつ消費されますか？");
    expect(source).toContain("ログインしないと使えませんか？");
    expect(source).toContain("有料プラン");
  });

  it("does not claim credit card registration is completely unnecessary", () => {
    expect(source).not.toContain("いいえ。無料ではじめる時点では");
  });
});
