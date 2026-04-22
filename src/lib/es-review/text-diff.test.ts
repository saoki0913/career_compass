import { describe, expect, it } from "vitest";
import { computeJapaneseDiff, countChanges } from "./text-diff";

describe("computeJapaneseDiff", () => {
  it("returns single same segment for identical text", () => {
    const text = "私は大学でプログラミングを学んだ。その経験を活かしたい。";
    const result = computeJapaneseDiff(text, text);
    expect(result).toEqual([{ type: "same", text }]);
  });

  it("returns empty array for two empty strings", () => {
    expect(computeJapaneseDiff("", "")).toEqual([]);
  });

  it("returns all added for empty original", () => {
    const revised = "新しい文章。";
    const result = computeJapaneseDiff("", revised);
    expect(result).toEqual([{ type: "added", text: revised }]);
  });

  it("returns all removed for empty revised", () => {
    const original = "古い文章。";
    const result = computeJapaneseDiff(original, "");
    expect(result).toEqual([{ type: "removed", text: original }]);
  });

  it("detects added sentence", () => {
    const original = "第一の理由は成長環境である。";
    const revised = "第一の理由は成長環境である。具体的には、若手への裁量が大きい。";
    const result = computeJapaneseDiff(original, revised);
    expect(result.some((s) => s.type === "added")).toBe(true);
    expect(result.some((s) => s.type === "same")).toBe(true);
  });

  it("detects removed sentence", () => {
    const original = "私は成長したい。なぜなら挑戦が好きだからだ。以上である。";
    const revised = "私は成長したい。以上である。";
    const result = computeJapaneseDiff(original, revised);
    expect(result.some((s) => s.type === "removed")).toBe(true);
  });

  it("produces character-level diff for modified sentences", () => {
    const original = "私はチームで協力した。";
    const revised = "私はチームで主導した。";
    const result = computeJapaneseDiff(original, revised);
    // Should have sub-character diffs, not whole-sentence replacement
    expect(result.length).toBeGreaterThan(1);
    const same = result.filter((s) => s.type === "same");
    expect(same.length).toBeGreaterThan(0);
  });

  it("handles text without sentence-ending punctuation", () => {
    const original = "文末に句点がない";
    const revised = "文末に読点がない";
    const result = computeJapaneseDiff(original, revised);
    expect(result.length).toBeGreaterThan(0);
  });

  it("handles long text within performance limits", () => {
    const sentences = Array.from(
      { length: 20 },
      (_, i) => `これは第${i + 1}文である。`,
    );
    const original = sentences.join("");
    const revised = sentences.slice(0, 10).join("") + "追加の文である。" + sentences.slice(10).join("");
    const start = performance.now();
    const result = computeJapaneseDiff(original, revised);
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(1000);
    expect(result.some((s) => s.type === "added")).toBe(true);
  });
});

describe("countChanges", () => {
  it("returns 0 for all same", () => {
    expect(countChanges([{ type: "same", text: "test" }])).toBe(0);
  });

  it("counts added and removed", () => {
    expect(
      countChanges([
        { type: "same", text: "a" },
        { type: "added", text: "b" },
        { type: "removed", text: "c" },
      ]),
    ).toBe(2);
  });
});
