import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  fetchFastApiInternalMock,
  normalizeInterviewPersistenceErrorMock,
} = vi.hoisted(() => ({
  fetchFastApiInternalMock: vi.fn(),
  normalizeInterviewPersistenceErrorMock: vi.fn(),
}));

vi.mock("@/lib/fastapi/client", () => ({
  fetchFastApiInternal: fetchFastApiInternalMock,
}));

vi.mock("./persistence-errors", () => ({
  INTERVIEW_PERSISTENCE_UNAVAILABLE_CODE: "INTERVIEW_PERSISTENCE_UNAVAILABLE",
  normalizeInterviewPersistenceError: normalizeInterviewPersistenceErrorMock,
}));

vi.mock("@/lib/ai/cost-summary-log", () => ({
  splitInternalTelemetry: vi.fn((payload: Record<string, unknown>) => ({
    payload,
    telemetry: null,
  })),
}));

describe("interview stream utils persistence errors", () => {
  beforeEach(() => {
    fetchFastApiInternalMock.mockReset();
    normalizeInterviewPersistenceErrorMock.mockReset();
  });

  it("emits a user-facing persistence SSE error when onComplete persistence fails", async () => {
    const { createInterviewUpstreamStream } = await import("./stream-utils");

    const upstream = new ReadableStream<Uint8Array>({
      start(controller) {
        const encoder = new TextEncoder();
        controller.enqueue(
          encoder.encode(
            'data: {"type":"complete","data":{"question":"最初の質問です。","turn_state":{"turnCount":1}}}\n',
          ),
        );
        controller.close();
      },
    });
    fetchFastApiInternalMock.mockResolvedValue(new Response(upstream, { status: 200 }));
    normalizeInterviewPersistenceErrorMock.mockReturnValue({
      code: "INTERVIEW_PERSISTENCE_UNAVAILABLE",
      companyId: "company-1",
      operation: "interview:start",
      missingTables: ["interview_conversations"],
      missingColumns: [],
    });

    const response = await createInterviewUpstreamStream({
      request: new NextRequest("http://localhost:3000/api/companies/company-1/interview/start", {
        method: "POST",
      }),
      upstreamPath: "/api/interview/start",
      upstreamPayload: {},
      onComplete: async () => {
        throw new Error('relation "interview_conversations" does not exist');
      },
    });

    const text = await response.text();
    expect(text).toContain("現在、面接対策の保存機能を一時的に利用できません。");
    expect(normalizeInterviewPersistenceErrorMock).toHaveBeenCalled();
  });
});
