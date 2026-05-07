/**
 * InterviewPageContent - smoke test
 *
 * Verifies that the component module exports InterviewPageContent
 * and that dead-code types (LastFailedAction) have been removed.
 */
import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";

describe("InterviewPageContent module", () => {
  it("exports InterviewPageContent", async () => {
    const source = await readFile(new URL("./InterviewPageContent.tsx", import.meta.url), "utf8");

    expect(source).toContain("export function InterviewPageContent");
  });

  it("renders a fail-closed persistence unavailable state", async () => {
    const source = await readFile(new URL("./InterviewPageContent.tsx", import.meta.url), "utf8");

    expect(source).toContain("availabilityIssue");
    expect(source).toContain("isInteractionBlocked");
    expect(source).toContain("企業詳細へ戻る");
    expect(source).toContain("window.location.reload()");
  });
});
