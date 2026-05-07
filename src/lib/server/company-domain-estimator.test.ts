import { describe, it, expect, beforeEach } from "vitest";
import {
  estimateCompanyLogoProfile,
  estimateCorporateUrl,
  _clearCache,
} from "./company-domain-estimator";

describe("estimateCorporateUrl", () => {
  beforeEach(() => {
    _clearCache();
  });

  it("returns URL for exact company name match with bare token", () => {
    // "三菱商事" has ["career-mc", "mitsubishicorp"] -- no dots, so first token + .co.jp
    const result = estimateCorporateUrl("三菱商事");
    expect(result).toBe("https://career-mc.co.jp");
  });

  it("returns URL with full domain when entry contains a dotted domain", () => {
    // "佐川急便" has ["sagawa-exp.co.jp", "sagawa-exp", "sagawa"]
    const result = estimateCorporateUrl("佐川急便");
    expect(result).toBe("https://sagawa-exp.co.jp");
  });

  it("returns URL for object-format entry with domains array", () => {
    // "三井住友銀行" is { domains: ["smbc.co.jp", ...], parent: ... }
    const result = estimateCorporateUrl("三井住友銀行");
    expect(result).toBe("https://smbc.co.jp");
  });

  it("returns null for unknown company", () => {
    const result = estimateCorporateUrl("存在しない会社");
    expect(result).toBeNull();
  });

  it("strips 株式会社 prefix and matches normalized name", () => {
    // "株式会社伊藤忠商事" -> normalize -> "伊藤忠商事" -> match
    const result = estimateCorporateUrl("株式会社伊藤忠商事");
    expect(result).not.toBeNull();
    expect(result).toContain("itochu");
  });

  it("strips (株) suffix and matches normalized name", () => {
    const result = estimateCorporateUrl("丸紅(株)");
    expect(result).not.toBeNull();
    expect(result).toContain("marubeni");
  });

  it("strips ㈱ and matches normalized name", () => {
    const result = estimateCorporateUrl("㈱双日");
    expect(result).not.toBeNull();
    expect(result).toContain("sojitz");
  });

  it("returns null for empty string", () => {
    expect(estimateCorporateUrl("")).toBeNull();
  });

  it("returns null when normalized name is empty", () => {
    // "株式会社" normalizes to ""
    expect(estimateCorporateUrl("株式会社")).toBeNull();
  });

  it("prefers dotted domain over bare token", () => {
    // "SGホールディングス" has ["sg-hldgs", "sagawa-exp", "sg-hldgs.co.jp"]
    const result = estimateCorporateUrl("SGホールディングス");
    expect(result).toBe("https://sg-hldgs.co.jp");
  });

  it("returns canonical logo domain for Mitsubishi Corporation", () => {
    const result = estimateCompanyLogoProfile("三菱商事");
    expect(result?.logoDomains[0]).toBe("mitsubishicorp.com");
    expect(result?.fallbackFaviconUrl).toBe(
      "https://www.google.com/s2/favicons?domain=mitsubishicorp.com&sz=128"
    );
  });

  it("returns canonical logo domain for MUFG Bank", () => {
    const result = estimateCompanyLogoProfile("三菱UFJ銀行");
    expect(result?.logoDomains[0]).toBe("bk.mufg.jp");
  });

  it("keeps existing full-domain logo candidates for Sagawa Express", () => {
    const result = estimateCompanyLogoProfile("佐川急便");
    expect(result?.logoDomains[0]).toBe("sagawa-exp.co.jp");
  });
});
