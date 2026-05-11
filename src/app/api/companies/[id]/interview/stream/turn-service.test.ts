import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";

const SRC_PATH = new URL("./turn-service.ts", import.meta.url);

describe("turn-service", () => {
  it("forwards next_question_hint as nextQuestionHint in return value", async () => {
    const source = await readFile(SRC_PATH, "utf8");
    expect(source).toContain("next_question_hint");
    expect(source).toContain("nextQuestionHint");
  });
});
