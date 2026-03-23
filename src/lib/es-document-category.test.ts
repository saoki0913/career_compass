import { describe, expect, it } from "vitest";
import {
  DEFAULT_ES_DOCUMENT_CATEGORY,
  normalizeEsDocumentCategory,
  esDocumentCategorySchema,
} from "@/lib/es-document-category";

describe("normalizeEsDocumentCategory", () => {
  it("returns entry_sheet for unknown values", () => {
    expect(normalizeEsDocumentCategory(undefined)).toBe(DEFAULT_ES_DOCUMENT_CATEGORY);
    expect(normalizeEsDocumentCategory("invalid")).toBe(DEFAULT_ES_DOCUMENT_CATEGORY);
  });

  it("accepts valid categories", () => {
    expect(normalizeEsDocumentCategory("resume")).toBe("resume");
    expect(normalizeEsDocumentCategory("tips")).toBe("tips");
  });
});

describe("esDocumentCategorySchema", () => {
  it("rejects invalid enum", () => {
    expect(esDocumentCategorySchema.safeParse("cover_letter").success).toBe(false);
  });
});
