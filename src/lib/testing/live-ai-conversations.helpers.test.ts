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
  buildDeterministicGakuchikaFollowupAnswer,
  collectStaleLiveAiCompanyIds,
  runGakuchikaSetupWithRequest,
} from "../../../e2e/live-ai-conversations.spec";

describe("live ai conversation helpers", () => {
  it("collects stale live ai companies by case id signature", () => {
    const staleIds = collectStaleLiveAiCompanyIds(
      [
        { id: "company-1", name: "テスト社_interview_company_fit_and_depth_live-ai-conversations-123" },
        { id: "company-2", name: "一般企業" },
        { id: "company-3", name: "別企業_motivation_company_reason_live-ai-conversations-456" },
      ],
      ["interview_company_fit_and_depth", "motivation_company_reason"],
    );

    expect(staleIds).toEqual(["company-1", "company-3"]);
  });

  it("builds deterministic gakuchika follow-up answers from transcript context", () => {
    const answer = buildDeterministicGakuchikaFollowupAnswer({
      nextQuestion: "そのとき自分の役割は何でしたか",
      attemptIndex: 2,
      transcript: [
        { role: "assistant", content: "最初の質問" },
        { role: "user", content: "校舎改善で共有フォーマットを作りました。" },
      ],
    });

    expect(answer).toContain("共有フォーマットを作りました");
    expect(answer).toContain("そのとき自分の役割は何でしたか");
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
      expect.stringContaining("1つ目の回答"),
    ]);
  });
});
