import { describe, expect, it } from "vitest";
import {
  parseOptionalString,
  parseStringArray,
  safeParseJsonValue,
  safeParseMessages,
} from "./parsers";

describe("safeParseJsonValue", () => {
  it("returns null for null/undefined", () => {
    expect(safeParseJsonValue(null)).toBeNull();
    expect(safeParseJsonValue(undefined)).toBeNull();
  });

  it("parses valid JSON string", () => {
    expect(safeParseJsonValue('{"a":1}')).toEqual({ a: 1 });
    expect(safeParseJsonValue("[1,2]")).toEqual([1, 2]);
  });

  it("returns null for invalid JSON string", () => {
    expect(safeParseJsonValue("{bad}")).toBeNull();
  });

  it("passes through non-string values", () => {
    const obj = { a: 1 };
    expect(safeParseJsonValue(obj)).toBe(obj);
    expect(safeParseJsonValue(42)).toBe(42);
    expect(safeParseJsonValue(true)).toBe(true);
  });
});

describe("parseOptionalString", () => {
  it("returns trimmed string for valid input", () => {
    expect(parseOptionalString("  hello  ")).toBe("hello");
  });

  it("returns null for empty or whitespace", () => {
    expect(parseOptionalString("")).toBeNull();
    expect(parseOptionalString("   ")).toBeNull();
  });

  it("returns null for non-string values", () => {
    expect(parseOptionalString(42)).toBeNull();
    expect(parseOptionalString(null)).toBeNull();
    expect(parseOptionalString(undefined)).toBeNull();
    expect(parseOptionalString({})).toBeNull();
  });
});

describe("parseStringArray", () => {
  it("filters to valid strings", () => {
    expect(parseStringArray(["a", 42, "b", null, "c"])).toEqual(["a", "b", "c"]);
  });

  it("returns empty for non-array", () => {
    expect(parseStringArray("not array")).toEqual([]);
    expect(parseStringArray(null)).toEqual([]);
    expect(parseStringArray(undefined)).toEqual([]);
  });

  it("trims strings when trim=true (default)", () => {
    expect(parseStringArray(["  a  ", "b"])).toEqual(["a", "b"]);
  });

  it("skips trimming when trim=false", () => {
    expect(parseStringArray(["  a  ", "b"], false)).toEqual(["  a  ", "b"]);
  });

  it("filters empty strings after trimming", () => {
    expect(parseStringArray(["  ", "", "a"])).toEqual(["a"]);
  });

  it("respects maxItems", () => {
    expect(parseStringArray(["a", "b", "c", "d"], true, 2)).toEqual(["a", "b"]);
  });
});

describe("safeParseMessages", () => {
  it("parses valid messages array", () => {
    const input = [
      { role: "user", content: "hi" },
      { role: "assistant", content: "hello" },
    ];
    const result = safeParseMessages(input);
    expect(result).toHaveLength(2);
    expect(result[0].role).toBe("user");
    expect(result[0].content).toBe("hi");
    expect(result[0].id).toBeTruthy();
  });

  it("preserves existing id", () => {
    const input = [{ id: "existing-id", role: "user", content: "hi" }];
    const result = safeParseMessages(input);
    expect(result[0].id).toBe("existing-id");
  });

  it("generates id when missing", () => {
    const input = [{ role: "user", content: "hi" }];
    const result = safeParseMessages(input);
    expect(result[0].id).toBeTruthy();
    expect(typeof result[0].id).toBe("string");
  });

  it("parses JSON string input", () => {
    const json = JSON.stringify([{ role: "user", content: "test" }]);
    const result = safeParseMessages(json);
    expect(result).toHaveLength(1);
  });

  it("filters invalid messages", () => {
    const input = [
      { role: "user", content: "valid" },
      { role: "system", content: "invalid role" },
      { role: "user" },
      null,
      "string",
    ];
    const result = safeParseMessages(input);
    expect(result).toHaveLength(1);
    expect(result[0].content).toBe("valid");
  });

  it("returns empty for non-array/invalid JSON", () => {
    expect(safeParseMessages(null)).toEqual([]);
    expect(safeParseMessages("not json")).toEqual([]);
    expect(safeParseMessages(42)).toEqual([]);
  });

  it("uses custom id generator", () => {
    const input = [{ role: "user", content: "hi" }];
    const result = safeParseMessages(input, { generateId: (i) => `msg-${i}` });
    expect(result[0].id).toBe("msg-0");
  });
});
