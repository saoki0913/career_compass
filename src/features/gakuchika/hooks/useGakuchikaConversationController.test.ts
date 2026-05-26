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

  it("delegates SSE handling to the shared runtime instead of raw boilerplate", () => {
    expect(source).toContain("useConversationRuntime");
    expect(source).toContain("createGakuchikaStreamAdapter");
    expect(source).not.toContain("new TextDecoder()");
    expect(source).not.toContain("getReader()");
    expect(source).not.toContain('line.startsWith("data: ")');
  });

  it("keeps SSE event handling out of the controller body", () => {
    expect(source).not.toContain('event.type === "field_complete"');
    expect(source).not.toContain('event.type === "progress"');
    expect(source).not.toContain('event.type === "string_chunk"');
    expect(source).not.toContain('event.type === "complete"');
    expect(source).not.toContain('event.type === "error"');
  });

  it("restores generatedDraftQuality from conversationState.draftQuality on fetch", () => {
    expect(source).toContain("toDraftResultQuality(restoredState.draftQuality)");
    expect(source).toContain("setGeneratedDraftQuality");
  });

  it("merges resume payload into existing state without resetting progress (bug2)", () => {
    // 深掘り再開時、サーバーが conversationState を返さなくても既存進捗を保持する
    expect(source).toContain("buildConversationStatePatch");
    const applyBlock = source.slice(
      source.indexOf("const applySessionPayload"),
      source.indexOf("const resumeSession"),
    );
    expect(applyBlock).toContain("buildConversationStatePatch");
    expect(applyBlock).not.toContain("|| getDefaultConversationState()");
  });
});
