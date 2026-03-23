import { describe, expect, it } from "vitest";

import {
  getVisibleReviewContentSize,
  shouldAutoScrollToLatest,
} from "./review-panel-scroll";

describe("review panel auto follow helpers", () => {
  it("computes a stable size from the visible streaming content", () => {
    expect(
      getVisibleReviewContentSize({
        rewriteText: "改善案",
        issues: [
          {
            issue: "課題",
            suggestion: "改善案",
            why_now: "理由",
          },
        ],
        sources: [{ excerpt: "出典" }],
      }),
    ).toBe("改善案".length + "課題".length + "改善案".length + "理由".length + "出典".length);
  });

  it("does not auto-scroll when there is no visible result yet", () => {
    expect(shouldAutoScrollToLatest({ hasVisibleResults: false, previousSize: 0, nextSize: 8 })).toBe(false);
  });

  it("auto-scrolls only when the visible streaming content grows", () => {
    expect(shouldAutoScrollToLatest({ hasVisibleResults: true, previousSize: 10, nextSize: 11 })).toBe(true);
    expect(shouldAutoScrollToLatest({ hasVisibleResults: true, previousSize: 11, nextSize: 11 })).toBe(false);
    expect(shouldAutoScrollToLatest({ hasVisibleResults: true, previousSize: 12, nextSize: 11 })).toBe(false);
  });
});
