import { describe, expect, it, vi } from "vitest";

vi.mock("@playwright/test", () => ({
  expect: {
    anything: () => Symbol("anything"),
  },
  test: {
    describe: {
      serial: vi.fn(),
    },
    beforeEach: vi.fn(),
    skip: vi.fn(),
  },
}));

import {
  createAuthenticatedCompanyWithRequest,
  runGakuchikaSetupWithRequest,
} from "../../../e2e/live-ai-conversations.spec";

describe("live ai conversation helpers", () => {
  it("uses the authenticated request path for company creation", async () => {
    const request = vi.fn().mockResolvedValue({
      ok: () => true,
      status: () => 200,
      statusText: () => "OK",
      text: async () => JSON.stringify({ company: { id: "company-1", name: "テスト会社" } }),
      json: async () => ({ company: { id: "company-1", name: "テスト会社" } }),
    });

    const company = await createAuthenticatedCompanyWithRequest(request as never, {} as never, {
      name: "テスト会社",
    });

    expect(company.id).toBe("company-1");
    expect(request).toHaveBeenCalledWith(
      expect.anything(),
      "POST",
      "/api/companies",
      { name: "テスト会社" },
    );
  });

  it("continues gakuchika setup with fallback answers until completion", async () => {
    const responses = [
      {
        ok: () => true,
        status: () => 200,
        statusText: () => "OK",
        text: async () =>
          'data: {"type":"complete","data":{"isCompleted":false,"nextQuestion":"次の質問"}}',
        json: async () => ({}),
      },
      {
        ok: () => true,
        status: () => 200,
        statusText: () => "OK",
        text: async () =>
          'data: {"type":"complete","data":{"isCompleted":true,"nextQuestion":null}}',
        json: async () => ({}),
      },
    ];

    const request = vi.fn(async (_page, method, endpoint, body) => {
      if (endpoint === "/api/gakuchika/gk-1/conversation/new") {
        return {
          ok: () => true,
          status: () => 200,
          statusText: () => "OK",
          text: async () =>
            JSON.stringify({
              conversation: { id: "conv-1" },
              messages: [{ role: "assistant", content: "最初の質問" }],
              nextQuestion: "最初の質問",
            }),
          json: async () => ({}),
        };
      }

      if (endpoint === "/api/gakuchika/gk-1/conversation/stream") {
        return responses.shift()!;
      }

      throw new Error(`unexpected endpoint: ${endpoint} ${String(method)} ${JSON.stringify(body)}`);
    });

    const transcript: Array<{ role: "assistant" | "user"; content: string }> = [];
    const result = await runGakuchikaSetupWithRequest(
      request as never,
      {} as never,
      "gk-1",
      ["1つ目の回答"],
      transcript,
    );

    expect(result?.isCompleted).toBe(true);
    expect(request).toHaveBeenCalledTimes(3);
    expect(transcript.filter((turn) => turn.role === "user").map((turn) => turn.content)).toEqual([
      "1つ目の回答",
      expect.stringContaining("補足"),
    ]);
  });
});
