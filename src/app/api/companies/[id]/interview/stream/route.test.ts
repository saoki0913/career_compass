import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  getRequestIdentityMock,
  buildInterviewContextMock,
  validateInterviewMessagesMock,
  createInterviewProxyStreamMock,
  createInterviewQuestionFlowCompleteStreamMock,
} = vi.hoisted(() => ({
  getRequestIdentityMock: vi.fn(),
  buildInterviewContextMock: vi.fn(),
  validateInterviewMessagesMock: vi.fn(),
  createInterviewProxyStreamMock: vi.fn(),
  createInterviewQuestionFlowCompleteStreamMock: vi.fn(),
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
  createInterviewQuestionFlowCompleteStream: createInterviewQuestionFlowCompleteStreamMock,
}));

describe("api/companies/[id]/interview/stream", () => {
  beforeEach(() => {
    getRequestIdentityMock.mockReset();
    buildInterviewContextMock.mockReset();
    validateInterviewMessagesMock.mockReset();
    createInterviewProxyStreamMock.mockReset();
    createInterviewQuestionFlowCompleteStreamMock.mockReset();

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
    createInterviewQuestionFlowCompleteStreamMock.mockResolvedValue(new Response("done"));
  });

  it("keeps the fifth answer in the question flow and does not auto-request feedback", async () => {
    const { POST } = await import("./route");
    const messages = [
      { role: "assistant", content: "Q1" },
      { role: "user", content: "A1" },
      { role: "assistant", content: "Q2" },
      { role: "user", content: "A2" },
      { role: "assistant", content: "Q3" },
      { role: "user", content: "A3" },
      { role: "assistant", content: "Q4" },
      { role: "user", content: "A4" },
      { role: "assistant", content: "Q5" },
      { role: "user", content: "A5" },
    ];
    const request = new NextRequest("http://localhost/api/companies/company-1/interview/stream", {
      method: "POST",
      body: JSON.stringify({ messages }),
      headers: { "content-type": "application/json" },
    });

    await POST(request, { params: Promise.resolve({ id: "company-1" }) });

    expect(createInterviewProxyStreamMock).not.toHaveBeenCalled();
    expect(createInterviewQuestionFlowCompleteStreamMock).toHaveBeenCalledWith({ messages });
  });
});
