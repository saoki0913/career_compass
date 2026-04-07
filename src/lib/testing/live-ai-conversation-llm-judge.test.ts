import { describe, expect, it } from "vitest";

import { parseLiveAiConversationLlmJudgeResponse } from "./live-ai-conversation-llm-judge";

describe("parseLiveAiConversationLlmJudgeResponse", () => {
  it("parses a bare JSON object", () => {
    const raw = parseLiveAiConversationLlmJudgeResponse(
      '{"overall_pass":true,"warnings":[],"fail_reasons":[]}',
    );
    expect(raw?.overall_pass).toBe(true);
  });

  it("extracts JSON from markdown fences", () => {
    const raw = parseLiveAiConversationLlmJudgeResponse(
      'Here you go:\n```json\n{"overall_pass":false,"fail_reasons":["depth:shallow"]}\n```\n',
    );
    expect(raw?.overall_pass).toBe(false);
    expect(raw?.fail_reasons).toEqual(["depth:shallow"]);
  });

  it("returns null for invalid payloads", () => {
    expect(parseLiveAiConversationLlmJudgeResponse("no braces")).toBeNull();
    expect(parseLiveAiConversationLlmJudgeResponse("{")).toBeNull();
  });
});
