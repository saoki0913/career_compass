/**
 * useInterviewConversationController - static analysis tests
 *
 * These tests verify the refactored module shape:
 *  1. Returned state type no longer exposes error / errorAction / persistenceUnavailable
 *  2. The module imports the shared SSE and timeout utilities
 *  3. The module imports notifyError for persistence error routing
 */
import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

const SRC_PATH = path.resolve(__dirname, "useInterviewConversationController.ts");
const source = fs.readFileSync(SRC_PATH, "utf-8");

describe("useInterviewConversationController module", () => {
  it("exports the hook function", () => {
    expect(source).toContain("export function useInterviewConversationController");
  });

  describe("removed dead code", () => {
    it("does not declare error / errorAction / persistenceUnavailable state", () => {
      // These useState declarations should be gone
      expect(source).not.toMatch(/useState<string \| null>\(null\).*\berror\b/);
      expect(source).not.toContain("const [error, setError]");
      expect(source).not.toContain("const [errorAction, setErrorAction]");
      expect(source).not.toContain("const [persistenceUnavailable, setPersistenceUnavailable]");
    });

    it("does not return error / errorAction / persistenceUnavailable in state object", () => {
      // Extract the return state block
      const returnBlock = source.slice(source.lastIndexOf("return {"));
      const stateBlock = returnBlock.slice(0, returnBlock.indexOf("actions:"));
      // These keys should not appear as standalone properties in the state object
      expect(stateBlock).not.toMatch(/^\s+error,$/m);
      expect(stateBlock).not.toMatch(/^\s+errorAction,$/m);
      expect(stateBlock).not.toMatch(/^\s+persistenceUnavailable,$/m);
    });

    it("does not contain applyPersistenceDiagnosticState", () => {
      expect(source).not.toContain("applyPersistenceDiagnosticState");
    });

    it("does not contain Phase 2 dead comments", () => {
      expect(source).not.toContain("Phase 2 Stage 6");
      expect(source).not.toContain("UI 未表示");
    });
  });

  describe("shared utility usage", () => {
    it("imports parseSSEStream from shared utility", () => {
      expect(source).toContain('import { parseSSEStream } from "@/hooks/conversation/sse-stream-parser"');
    });

    it("imports createStreamTimeout from shared utility", () => {
      expect(source).toContain('import { createStreamTimeout } from "@/hooks/conversation/stream-timeout"');
    });

    it("does not contain manual SSE reader/decoder/buffer boilerplate", () => {
      expect(source).not.toContain("new TextDecoder()");
      expect(source).not.toContain("response.body?.getReader()");
      expect(source).not.toContain('buffer.split("\\n")');
    });

    it("does not contain manual AbortController timeout boilerplate", () => {
      expect(source).not.toContain("new AbortController()");
      expect(source).not.toContain("setTimeout(() => controller.abort()");
    });

    it("uses for-await-of parseSSEStream", () => {
      expect(source).toContain("for await (const event of parseSSEStream(response))");
    });
  });

  describe("error notification routing", () => {
    it("imports notifyError from notifications", () => {
      expect(source).toContain('import { notifyError } from "@/lib/notifications"');
    });

    it("calls notifyError for persistence unavailable errors", () => {
      expect(source).toContain("INTERVIEW_PERSISTENCE_UNAVAILABLE_CODE");
      expect(source).toContain("notifyError({");
      expect(source).toContain("window.location.reload()");
    });

    it("calls notifyUserFacingAppError for other errors", () => {
      expect(source).toContain("notifyUserFacingAppError(uiError)");
    });
  });

  describe("shortCoaching state preserved", () => {
    it("keeps shortCoaching useState", () => {
      expect(source).toContain("const [shortCoaching, setShortCoaching]");
    });

    it("returns shortCoaching in state", () => {
      const returnBlock = source.slice(source.lastIndexOf("return {"));
      expect(returnBlock).toContain("shortCoaching,");
    });
  });
});
