import { describe, expect, it } from "vitest";

import { progressLabelToContextLabel } from "./useGakuchikaViewModel";

describe("progressLabelToContextLabel", () => {
  it("maps known progress labels to conversational thinking labels", () => {
    expect(progressLabelToContextLabel("行動を整理中")).toBe("行動について整理しています...");
    expect(progressLabelToContextLabel("課題を確認中")).toBe("課題について整理しています...");
    expect(progressLabelToContextLabel("深掘り中")).toBe("深掘りの論点を整理しています...");
  });

  it("trims empty labels and falls back to the original label", () => {
    expect(progressLabelToContextLabel("  ")).toBeNull();
    expect(progressLabelToContextLabel("独自観点")).toBe("独自観点...");
  });
});
