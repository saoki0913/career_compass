import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";

describe("useGakuchikaConversationController", () => {
  let source: string;

  beforeAll(async () => {
    source = await readFile(
      new URL("./useGakuchikaConversationController.ts", import.meta.url),
      "utf8",
    );
  });

  it("does not declare unused error state", () => {
    expect(source).not.toMatch(/\[error,\s*setError\]/);
    expect(source).not.toContain("setError(");
    expect(source).not.toContain("setError,");
  });

  it("uses parseSSEStream instead of raw SSE boilerplate", () => {
    expect(source).toContain("parseSSEStream");
    expect(source).not.toContain("new TextDecoder()");
    expect(source).not.toContain("getReader()");
    expect(source).not.toContain('line.startsWith("data: ")');
  });

  it("still handles all SSE event types", () => {
    expect(source).toContain('event.type === "field_complete"');
    expect(source).toContain('event.type === "progress"');
    expect(source).toContain('event.type === "string_chunk"');
    expect(source).toContain('event.type === "complete"');
    expect(source).toContain('event.type === "error"');
  });
});
