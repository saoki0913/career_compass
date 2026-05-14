import { describe, expect, it } from "vitest";

/**
 * documentId validation extracted for testability.
 * The same logic is inlined in useESReview.requestSectionReview.
 */
function isInvalidDocumentId(id: string): boolean {
  const trimmed = id.trim();
  return !trimmed || trimmed === "undefined" || trimmed === "null";
}

describe("useESReview documentId validation", () => {
  it("rejects empty string", () => {
    expect(isInvalidDocumentId("")).toBe(true);
  });

  it("rejects whitespace-only string", () => {
    expect(isInvalidDocumentId("   ")).toBe(true);
  });

  it("rejects 'undefined' as string", () => {
    expect(isInvalidDocumentId("undefined")).toBe(true);
  });

  it("rejects 'null' as string", () => {
    expect(isInvalidDocumentId("null")).toBe(true);
  });

  it("accepts valid UUID", () => {
    expect(isInvalidDocumentId("550e8400-e29b-41d4-a716-446655440000")).toBe(false);
  });

  it("accepts short alphanumeric id", () => {
    expect(isInvalidDocumentId("doc-123")).toBe(false);
  });
});
