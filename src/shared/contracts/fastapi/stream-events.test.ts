import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  fastApiStreamEventSchema,
  getGakuchikaFieldCompletePatch,
} from "./stream-events";

type ContractFixtures = {
  streamEvents: Record<string, unknown>;
};

function readFixtures(): ContractFixtures {
  const fixturePath = path.join(process.cwd(), "tests/fixtures/bff-fastapi-contract-fixtures.json");
  return JSON.parse(readFileSync(fixturePath, "utf8")) as ContractFixtures;
}

describe("FastAPI stream event contracts", () => {
  const { streamEvents } = readFixtures();

  it.each([
    "progress",
    "stringChunk",
    "gakuchikaFieldComplete",
    "gakuchikaComplete",
    "motivationComplete",
    "esReviewComplete",
    "interviewComplete",
    "error",
  ])("parses %s fixture", (key) => {
    expect(() => fastApiStreamEventSchema.parse(streamEvents[key])).not.toThrow();
  });

  it("keeps ES review complete payload on result, not data", () => {
    const event = fastApiStreamEventSchema.parse(streamEvents.esReviewComplete);

    expect(event.type).toBe("complete");
    expect("result" in event).toBe(true);
    expect("data" in event).toBe(false);
  });

  it("treats complete as a final snapshot for gakuchika", () => {
    const event = fastApiStreamEventSchema.parse(streamEvents.gakuchikaComplete);

    expect(event.type).toBe("complete");
    if (event.type !== "complete" || !("data" in event)) {
      throw new Error("Expected gakuchika complete event");
    }
    expect(event.data.conversation_state).toMatchObject({
      stage: "es_building",
      remaining_questions_estimate: 0,
      ready_for_draft: true,
    });
  });

  it("ignores unknown gakuchika field_complete paths", () => {
    expect(getGakuchikaFieldCompletePatch(streamEvents.gakuchikaUnknownFieldComplete)).toBeNull();
  });

  it("accepts remaining_questions_estimate only as a non-negative integer", () => {
    expect(getGakuchikaFieldCompletePatch(streamEvents.gakuchikaFieldComplete)).toEqual({
      remaining_questions_estimate: 0,
    });
    expect(() =>
      fastApiStreamEventSchema.parse({
        type: "field_complete",
        path: "remaining_questions_estimate",
        value: -1,
      }),
    ).toThrow();
  });
});
