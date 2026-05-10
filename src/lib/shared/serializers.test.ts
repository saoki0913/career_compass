import { describe, expect, it } from "vitest";
import { serializeOrNull } from "./serializers";

describe("serializeOrNull", () => {
  it("returns value when present", () => {
    expect(serializeOrNull("hello")).toBe("hello");
    expect(serializeOrNull(42)).toBe(42);
    expect(serializeOrNull({ a: 1 })).toEqual({ a: 1 });
  });

  it("returns null for null", () => {
    expect(serializeOrNull(null)).toBeNull();
  });

  it("returns null for undefined", () => {
    expect(serializeOrNull(undefined)).toBeNull();
  });

  it("preserves falsy values that are not null/undefined", () => {
    expect(serializeOrNull(0)).toBe(0);
    expect(serializeOrNull("")).toBe("");
    expect(serializeOrNull(false)).toBe(false);
  });
});
