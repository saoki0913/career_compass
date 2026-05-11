import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";

const SRC_PATH = new URL("./stream-shared.ts", import.meta.url);

describe("stream-shared types", () => {
  it("UpstreamCompleteData includes next_question_hint", async () => {
    const source = await readFile(SRC_PATH, "utf8");
    expect(source).toContain("next_question_hint");
  });

  it("InterviewClientCompleteData includes nextQuestionHint", async () => {
    const source = await readFile(SRC_PATH, "utf8");
    expect(source).toContain("nextQuestionHint");
  });
});
