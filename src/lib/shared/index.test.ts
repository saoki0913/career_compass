import { describe, expect, it } from "vitest";
import {
  buildJsonHeaders,
  parseOptionalString,
  parseStringArray,
  postJson,
  safeParseJsonValue,
  safeParseMessages,
  serializeOrNull,
  withQuery,
} from "./index";

describe("shared/index barrel", () => {
  it("re-exports parsers", () => {
    expect(safeParseJsonValue).toBeTypeOf("function");
    expect(parseOptionalString).toBeTypeOf("function");
    expect(parseStringArray).toBeTypeOf("function");
    expect(safeParseMessages).toBeTypeOf("function");
  });

  it("re-exports serializers", () => {
    expect(serializeOrNull).toBeTypeOf("function");
  });

  it("re-exports client-api", () => {
    expect(buildJsonHeaders).toBeTypeOf("function");
    expect(withQuery).toBeTypeOf("function");
    expect(postJson).toBeTypeOf("function");
  });
});
