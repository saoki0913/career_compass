import { describe, expect, it } from "vitest";

describe("bff/gakuchika/fastapi-stream", () => {
  it("sends previous_stage as top-level body field", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile(
      new URL("./fastapi-stream.ts", import.meta.url),
      "utf8",
    );
    expect(source).toContain("previous_stage: conversationState?.stage");
  });
});
