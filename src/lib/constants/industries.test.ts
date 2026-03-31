import { describe, expect, it } from "vitest";
import { canonicalizeIndustry } from "./industries";

describe("canonicalizeIndustry", () => {
  it("maps legacy IT software labels to the canonical taxonomy", () => {
    expect(canonicalizeIndustry("IT・ソフトウェア")).toBe("IT・通信");
  });
});
