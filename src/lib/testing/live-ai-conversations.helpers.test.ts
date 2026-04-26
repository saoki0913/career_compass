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
  buildDeterministicMotivationFollowupAnswer,
  collectStaleLiveAiCompanyIds,
  parseSseEvents,
  runMotivationSetupWithRequest,
  runGakuchikaSetupWithRequest,
} from "../../../e2e/helpers/live-ai-conversation-utils";

describe("live ai conversation helpers", () => {
  it("collects stale live ai companies by case id signature", () => {
    const staleIds = collectStaleLiveAiCompanyIds(
      [
        { id: "company-1", name: "テスト社_interview_company_fit_and_depth_live-ai-conversations-123" },
        { id: "company-2", name: "一般企業" },
        { id: "company-3", name: "別企業_motivation_company_reason_live-ai-conversations-456" },
      ],
      ["interview_company_fit_and_depth", "motivation_company_reason"],
      "live-ai-conversations-123",
    );

    expect(staleIds).toEqual(["company-1"]);
  });

  it("parses multi-line SSE data payloads", () => {
    const events = parseSseEvents(
      [
        'data: {"type":"complete",',
        'data: "data":{"ok":true}}',
        "",
      ].join("\n"),
    );

    expect(events).toEqual([{ type: "complete", data: { ok: true } }]);
  });

  it("throws on malformed SSE data instead of silently dropping events", () => {
    expect(() => parseSseEvents("data: {not-json}\n\n")).toThrow(/Malformed SSE event JSON/);
  });

  it("builds deterministic gakuchika follow-up answers from transcript context", () => {
    const answer = buildDeterministicGakuchikaFollowupAnswer({
      nextQuestion: "そのとき自分の役割は何でしたか",
      attemptIndex: 0,
    });

    expect(answer).toContain("共有フォーマット");
    expect(answer).toContain("役割");
  });

  it("builds deterministic motivation follow-up answers from slot context", async () => {
    const request = vi.fn(async (_page, method, endpoint) => {
      if (endpoint === "/api/motivation/company-1/conversation/start" && method === "POST") {
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
        };
      }

      if (endpoint === "/api/motivation/company-1/conversation/stream" && method === "POST") {
        return {
          ok: () => true,
          status: () => 200,
          statusText: () => "OK",
          text: async () =>
            'data: {"type":"complete","data":{"isDraftReady":true,"questionStage":"industry_reason","nextQuestion":null}}',
        };
      }

      throw new Error(`unexpected endpoint: ${endpoint} ${String(method)}`);
    });

    const transcript: Array<{ role: "assistant" | "user"; content: string }> = [];
    const result = await runMotivationSetupWithRequest(
      request,
      {} as never,
      "company-1",
      "IT・通信",
      "企画職",
      [],
      transcript,
    );

    expect(result?.isDraftReady).toBe(true);
    expect(transcript.at(-1)?.content).toContain("顧客課題");
    expect(transcript.at(-1)?.content).not.toContain("特に「");
  });

  it("rotates concrete motivation origin answers on repeated experience prompts", () => {
    const first = buildDeterministicMotivationFollowupAnswer({
      nextQuestion: "その関心を持った原体験は何ですか？",
      attemptIndex: 0,
    });
    const second = buildDeterministicMotivationFollowupAnswer({
      nextQuestion: "その関心を持った原体験は何ですか？",
      attemptIndex: 1,
    });

    expect(first).toContain("原体験");
    expect(second).not.toBe(first);
    expect(second).toContain("仕組み");
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
    const userAnswers = transcript.filter((turn) => turn.role === "user").map((turn) => turn.content);
    expect(userAnswers[0]).toBe("1つ目の回答");
    expect(userAnswers[1]).toContain("見直す必要");
    expect(userAnswers[1]).not.toContain("直前の回答");
  });

  it("retries motivation setup once after a 409 by resetting the conversation", async () => {
    let startAttempts = 0;
    const request = vi.fn(async (_page, method, endpoint, body) => {
      if (endpoint === "/api/motivation/company-1/conversation/start" && method === "POST") {
        startAttempts += 1;
        if (startAttempts === 1) {
          return {
            ok: () => false,
            status: () => 409,
            statusText: () => "Conflict",
            text: async () => JSON.stringify({ error: "この会話は既に開始されています" }),
          };
        }
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
          };
      }

      if (endpoint === "/api/motivation/company-1/conversation" && method === "DELETE") {
        return {
          ok: () => true,
          status: () => 200,
          statusText: () => "OK",
          text: async () => JSON.stringify({ success: true, reset: true }),
        };
      }

      if (endpoint === "/api/motivation/company-1/conversation/stream" && method === "POST") {
        return {
          ok: () => true,
          status: () => 200,
          statusText: () => "OK",
          text: async () =>
            'data: {"type":"complete","data":{"isDraftReady":true,"nextQuestion":null}}',
        };
      }

      throw new Error(`unexpected endpoint: ${endpoint} ${String(method)} ${JSON.stringify(body)}`);
    });

    const transcript: Array<{ role: "assistant" | "user"; content: string }> = [];
    const result = await runMotivationSetupWithRequest(
      request,
      {} as never,
      "company-1",
      "業界",
      "営業",
      ["最初の回答"],
      transcript,
    );

    expect(result?.isDraftReady).toBe(true);
    expect(request).toHaveBeenNthCalledWith(
      2,
      {},
      "DELETE",
      "/api/motivation/company-1/conversation",
    );
  });
});
