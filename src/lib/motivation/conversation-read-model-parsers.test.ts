import { describe, expect, it } from "vitest";
import {
  parseStringArray,
  safeParseJsonValue,
} from "./conversation-read-model-parsers";

describe("safeParseJsonValue (re-exported from shared)", () => {
  it("returns null for null/undefined", () => {
    expect(safeParseJsonValue(null)).toBeNull();
    expect(safeParseJsonValue(undefined)).toBeNull();
  });

  it("parses valid JSON string", () => {
    expect(safeParseJsonValue('{"a":1}')).toEqual({ a: 1 });
  });

  it("returns null for invalid JSON string", () => {
    expect(safeParseJsonValue("{bad}")).toBeNull();
  });

  it("passes through non-string values", () => {
    const obj = { a: 1 };
    expect(safeParseJsonValue(obj)).toBe(obj);
  });
});

describe("parseStringArray (local, no-trim variant)", () => {
  it("filters to valid strings without trimming", () => {
    expect(parseStringArray(["  a  ", 42, "b", null])).toEqual(["  a  ", "b"]);
  });

  it("returns empty for non-array", () => {
    expect(parseStringArray("not array")).toEqual([]);
    expect(parseStringArray(null)).toEqual([]);
    expect(parseStringArray(undefined)).toEqual([]);
  });

  it("keeps empty strings (no trim/filter)", () => {
    expect(parseStringArray(["", "a", ""])).toEqual(["", "a", ""]);
  });
});
