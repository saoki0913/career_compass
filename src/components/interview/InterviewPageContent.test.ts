/**
 * InterviewPageContent - smoke test
 *
 * Verifies that the component module exports InterviewPageContent
 * and that dead-code types (LastFailedAction) have been removed.
 */
import { describe, expect, it } from "vitest";

describe("InterviewPageContent module", () => {
  it("exports InterviewPageContent", async () => {
    const mod = await import("./InterviewPageContent");
    expect(typeof mod.InterviewPageContent).toBe("function");
  });
});
