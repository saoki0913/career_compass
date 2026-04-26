import { describe, expect, it } from "vitest";
import { getCompanyAvatarColor } from "@/lib/dashboard-utils";

describe("CompanyProgressCard", () => {
  it("uses deterministic avatar colors for company names", () => {
    const color1 = getCompanyAvatarColor("三菱商事");
    const color2 = getCompanyAvatarColor("三菱商事");
    expect(color1).toBe(color2);
  });

  it("generates different colors for different companies", () => {
    const colors = new Set(
      ["トヨタ", "ソニー", "楽天", "任天堂", "パナソニック"].map(getCompanyAvatarColor)
    );
    expect(colors.size).toBeGreaterThan(1);
  });
});
