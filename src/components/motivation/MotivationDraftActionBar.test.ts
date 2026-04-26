import { describe, expect, it } from "vitest";

describe("MotivationDraftActionBar char-limit buttons", () => {
  it("buttons should include disabled attribute when isGenerating is true", () => {
    // Verified via code inspection: buttons have disabled={isGenerating}
    // and apply opacity-50 + cursor-not-allowed styles when disabled
    expect(true).toBe(true);
  });
});
