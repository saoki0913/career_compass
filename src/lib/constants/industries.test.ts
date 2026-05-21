import { describe, expect, it } from "vitest";
import { canonicalizeIndustry } from "./industries";

describe("canonicalizeIndustry", () => {
  it("maps legacy IT software labels to the canonical taxonomy", () => {
    expect(canonicalizeIndustry("IT・ソフトウェア")).toBe("IT・通信");
  });

  it("returns null for the legacy umbrella finance label that has no single canonical form", () => {
    expect(canonicalizeIndustry("金融・保険")).toBeNull();
  });
});
