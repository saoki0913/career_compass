import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  getRequestIdentityMock,
  buildInterviewContextMock,
  validateInterviewMessagesMock,
  createInterviewProxyStreamMock,
} = vi.hoisted(() => ({
  getRequestIdentityMock: vi.fn(),
  buildInterviewContextMock: vi.fn(),
  validateInterviewMessagesMock: vi.fn(),
  createInterviewProxyStreamMock: vi.fn(),
}));

vi.mock("@/app/api/_shared/request-identity", () => ({
  getRequestIdentity: getRequestIdentityMock,
}));

vi.mock("../shared", () => ({
  buildInterviewContext: buildInterviewContextMock,
  validateInterviewMessages: validateInterviewMessagesMock,
}));

vi.mock("../stream-utils", () => ({
  createInterviewProxyStream: createInterviewProxyStreamMock,
}));

describe("api/companies/[id]/interview/feedback", () => {
  beforeEach(() => {
    getRequestIdentityMock.mockReset();
    buildInterviewContextMock.mockReset();
    validateInterviewMessagesMock.mockReset();
    createInterviewProxyStreamMock.mockReset();

    getRequestIdentityMock.mockResolvedValue({ userId: "user-1" });
    buildInterviewContextMock.mockResolvedValue({
      company: { id: "company-1", name: "テスト株式会社" },
      companySummary: "企業情報",
      motivationSummary: "志望動機",
      gakuchikaSummary: "ガクチカ",
      esSummary: "ES",
    });
    validateInterviewMessagesMock.mockImplementation((messages: unknown) => messages);
    createInterviewProxyStreamMock.mockResolvedValue(new Response("ok"));
  });

  it("requests interview feedback only when the dedicated endpoint is called", async () => {
    const { POST } = await import("./route");
    const messages = [
      { role: "assistant", content: "Q1" },
      { role: "user", content: "A1" },
    ];
    const request = new NextRequest("http://localhost/api/companies/company-1/interview/feedback", {
      method: "POST",
      body: JSON.stringify({ messages }),
      headers: { "content-type": "application/json" },
    });

    await POST(request, { params: Promise.resolve({ id: "company-1" }) });

    expect(createInterviewProxyStreamMock).toHaveBeenCalledWith(
      expect.objectContaining({
        upstreamPath: "/api/interview/feedback",
        isCompleted: true,
      }),
    );
  });
});
