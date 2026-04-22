import { describe, expect, it } from "vitest";
import { classifyTier, getEffectiveTiers } from "./deadline-importance";

describe("getEffectiveTiers", () => {
  it("returns all 4 tiers for es_submission (aggressive)", () => {
    expect(getEffectiveTiers("es_submission")).toEqual(["7d", "3d", "1d", "0d"]);
  });

  it("returns 3 tiers for briefing (standard)", () => {
    expect(getEffectiveTiers("briefing")).toEqual(["3d", "1d", "0d"]);
  });

  it("returns 2 tiers for other (light)", () => {
    expect(getEffectiveTiers("other")).toEqual(["1d", "0d"]);
  });

  it("defaults unknown types to light (2 tiers)", () => {
    expect(getEffectiveTiers("unknown_type_xyz")).toEqual(["1d", "0d"]);
  });

  it("returns user overrides when provided for a known type", () => {
    const overrides = { es_submission: ["1d", "0d"] as const };
    expect(getEffectiveTiers("es_submission", overrides)).toEqual(["1d", "0d"]);
  });

  it("falls back to default tiers when overrides do not include the requested type", () => {
    const overrides = { other: ["0d"] as const };
    expect(getEffectiveTiers("briefing", overrides)).toEqual(["3d", "1d", "0d"]);
  });

  it("applies overrides even for unknown types", () => {
    const overrides = { custom_type: ["7d", "0d"] as const };
    expect(getEffectiveTiers("custom_type", overrides)).toEqual(["7d", "0d"]);
  });

  it("treats null overrides as absent", () => {
    expect(getEffectiveTiers("es_submission", null)).toEqual(["7d", "3d", "1d", "0d"]);
  });
});

describe("classifyTier", () => {
  it("classifies 6 hours as 0d (0–12 range)", () => {
    expect(classifyTier(6)).toBe("0d");
  });

  it("classifies exactly 0 hours as 0d (lower boundary)", () => {
    expect(classifyTier(0)).toBe("0d");
  });

  it("classifies 24 hours as 1d (12–36 range)", () => {
    expect(classifyTier(24)).toBe("1d");
  });

  it("classifies exactly 12 hours as 1d (1d lower boundary)", () => {
    expect(classifyTier(12)).toBe("1d");
  });

  it("classifies 48 hours as 3d (36–84 range)", () => {
    expect(classifyTier(48)).toBe("3d");
  });

  it("classifies 100 hours as 7d (84–180 range)", () => {
    expect(classifyTier(100)).toBe("7d");
  });

  it("classifies exactly 84 hours as 7d (7d lower boundary)", () => {
    expect(classifyTier(84)).toBe("7d");
  });

  it("returns null for 200 hours (above all ranges)", () => {
    expect(classifyTier(200)).toBeNull();
  });

  it("returns null at exactly 180 hours (upper boundary is exclusive)", () => {
    expect(classifyTier(180)).toBeNull();
  });
});
