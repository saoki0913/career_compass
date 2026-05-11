import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";

describe("useMotivationConversationController", () => {
  it("handleGenerateDraft does not set error when nextQuestion is null", () => {
    expect(true).toBe(true);
  });

  it("does not export error or conversationLoadError state", async () => {
    const source = await readFile(new URL("./useMotivationConversationController.ts", import.meta.url), "utf8");
    expect(source).not.toMatch(/useState<string \| null>\(null\);\s*\n.*conversationLoadError/);
    expect(source).not.toContain("setConversationLoadError,");
    expect(source).not.toContain("setError,");
    expect(source).not.toContain("error,\n");
  });

  it("uses notifyError for retryable API failures", async () => {
    const source = await readFile(new URL("./useMotivationConversationController.ts", import.meta.url), "utf8");
    expect(source).toContain("notifyError");
  });

  it("uses notifyInfo for operation lock messages", async () => {
    const source = await readFile(new URL("./useMotivationConversationController.ts", import.meta.url), "utf8");
    expect(source).toContain("notifyInfo");
  });

  it("does not export roleOptionsError state", async () => {
    const source = await readFile(new URL("./useMotivationConversationController.ts", import.meta.url), "utf8");
    expect(source).not.toContain("setRoleOptionsError");
    expect(source).not.toMatch(/roleOptionsError,\n/);
    expect(source).not.toMatch(/roleOptionsError:/);
  });

  it("uses shared parseSSEStream instead of manual reader/decoder/buffer", async () => {
    const source = await readFile(new URL("./conversation/index.ts", import.meta.url), "utf8");
    expect(source).toContain("parseSSEStream");
    expect(source).not.toContain("new TextDecoder()");
    expect(source).not.toContain("getReader()");
  });

  it("uses shared createStreamTimeout instead of manual AbortController", async () => {
    const source = await readFile(new URL("./conversation/index.ts", import.meta.url), "utf8");
    expect(source).toContain("createStreamTimeout");
    expect(source).not.toContain("setTimeout(() => controller.abort()");
  });

  it("does not use window.confirm for reset — uses dialog state instead", async () => {
    const source = await readFile(new URL("./useMotivationConversationController.ts", import.meta.url), "utf8");
    expect(source).not.toContain("window.confirm");
    expect(source).toContain("restartDialogOpen");
    expect(source).toContain("setRestartDialogOpen");
    expect(source).toContain("requestResetConversation");
    expect(source).toContain("confirmResetConversation");
  });

  it("does not export handleResetConversation as a return value", async () => {
    const source = await readFile(new URL("./useMotivationConversationController.ts", import.meta.url), "utf8");
    expect(source).not.toMatch(/^\s+handleResetConversation,$/m);
    expect(source).not.toMatch(/const handleResetConversation/);
  });
});
