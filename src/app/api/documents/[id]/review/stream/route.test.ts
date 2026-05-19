import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { handleReviewStreamMock } = vi.hoisted(() => ({
  handleReviewStreamMock: vi.fn(),
}));

vi.mock("@/bff/es-review/handle-review-stream", () => ({
  handleReviewStream: handleReviewStreamMock,
}));

describe("documents/[id]/review/stream route", () => {
  it("exports POST and delegates to the ES review BFF stream handler", async () => {
    const { POST } = await import("./route");
    const request = new NextRequest("http://localhost:3000/api/documents/doc-1/review/stream", {
      method: "POST",
    });
    const context = { params: Promise.resolve({ id: "doc-1" }) };
    handleReviewStreamMock.mockResolvedValueOnce(new Response(null, { status: 204 }));

    const response = await POST(request, context);

    expect(typeof POST).toBe("function");
    expect(response.status).toBe(204);
    expect(handleReviewStreamMock).toHaveBeenCalledWith(
      request,
      context,
      "/api/es/review/stream",
    );
  });
});
