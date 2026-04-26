import { describe, expect, it } from "vitest";
import { getCompanyFaviconUrl, getCompanyAvatarColor } from "./dashboard-utils";

describe("getCompanyFaviconUrl", () => {
  it("returns icon.horse URL for valid corporateUrl", () => {
    expect(getCompanyFaviconUrl("https://www.toyota.co.jp")).toBe(
      "https://icon.horse/icon/www.toyota.co.jp"
    );
  });

  it("returns null when corporateUrl is null", () => {
    expect(getCompanyFaviconUrl(null)).toBeNull();
  });

  it("returns null for invalid URL", () => {
    expect(getCompanyFaviconUrl("not-a-url")).toBeNull();
  });

  it("extracts hostname correctly", () => {
    expect(getCompanyFaviconUrl("https://recruit.example.co.jp/careers")).toBe(
      "https://icon.horse/icon/recruit.example.co.jp"
    );
  });
});

describe("getCompanyAvatarColor", () => {
  it("returns a color class string", () => {
    const result = getCompanyAvatarColor("三菱商事");
    expect(result).toMatch(/^bg-\w+-100 text-\w+-700$/);
  });

  it("returns the same color for the same name", () => {
    const a = getCompanyAvatarColor("ソニー");
    const b = getCompanyAvatarColor("ソニー");
    expect(a).toBe(b);
  });

  it("returns different colors for different names", () => {
    const colors = new Set(
      ["トヨタ", "ソニー", "三菱商事", "佐川急便", "楽天"].map(getCompanyAvatarColor)
    );
    expect(colors.size).toBeGreaterThan(1);
  });
});
