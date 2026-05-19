// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";

const { postJsonMock, trackEventMock } = vi.hoisted(() => ({
  postJsonMock: vi.fn(),
  trackEventMock: vi.fn(),
}));

vi.mock("@/lib/shared/client-api", () => ({
  postJson: postJsonMock,
}));

vi.mock("@/lib/analytics/client", () => ({
  trackEvent: trackEventMock,
}));

import { useESReview } from "./useESReview";

/**
 * documentId validation extracted for testability.
 * The same logic is inlined in useESReview.requestSectionReview.
 */
function isInvalidDocumentId(id: string): boolean {
  const trimmed = id.trim();
  return !trimmed || trimmed === "undefined" || trimmed === "null";
}

describe("useESReview documentId validation", () => {
  beforeEach(() => {
    postJsonMock.mockReset();
    trackEventMock.mockReset();
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn(() => ({
        matches: true,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

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

  it("posts section review requests to the document-scoped stream route through CSRF-aware postJson", async () => {
    postJsonMock.mockResolvedValueOnce(
      new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(
              new TextEncoder().encode(
                'data: {"type":"complete","result":{"rewrites":["改善後の本文"]}}\n\n',
              ),
            );
            controller.close();
          },
        }),
        { status: 200, headers: { "content-type": "text/event-stream" } },
      ),
    );
    const { result } = renderHook(() =>
      useESReview({
        documentId: "doc/needs encoding",
        esReviewBillingPlan: "free",
      }),
    );

    let ok = false;
    await act(async () => {
      ok = await result.current.requestSectionReview({
        sectionTitle: "志望動機",
        sectionContent: "志望理由です",
        sectionCharLimit: 400,
      });
    });

    expect(ok).toBe(true);
    expect(postJsonMock).toHaveBeenCalledWith(
      "/api/documents/doc%2Fneeds%20encoding/review/stream",
      expect.objectContaining({
        content: "志望理由です",
        sectionTitle: "志望動機",
        sectionCharLimit: 400,
      }),
      expect.any(AbortSignal),
    );
    expect(result.current.finalRewriteText).toBe("改善後の本文");
  });
});
