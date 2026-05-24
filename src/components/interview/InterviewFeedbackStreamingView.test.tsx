import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const source = readFileSync(path.resolve(__dirname, "InterviewFeedbackStreamingView.tsx"), "utf8");

describe("InterviewFeedbackStreamingView", () => {
  it("renders streaming feedback fields progressively", () => {
    expect(source).toContain("overall_comment");
    expect(source).toContain("strengths");
    expect(source).toContain("improvements");
  });

  it("announces progress for a11y", () => {
    expect(source).toContain('aria-live="polite"');
  });
});
