import { describe, expect, it } from "vitest";
import {
  COMPANY_SUGGESTIONS_MIN_QUERY_LENGTH,
  normalizeCompanySuggestionsQuery,
} from "./useCompanySuggestions";

describe("normalizeCompanySuggestionsQuery", () => {
  it("requires at least two trimmed characters", () => {
    expect(COMPANY_SUGGESTIONS_MIN_QUERY_LENGTH).toBe(2);
    expect(normalizeCompanySuggestionsQuery("")).toBeNull();
    expect(normalizeCompanySuggestionsQuery(" サ ")).toBeNull();
    expect(normalizeCompanySuggestionsQuery(" サン ")).toBe("サン");
  });
});
