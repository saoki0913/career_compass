import { describe, it, expect } from "vitest";
import { deriveMotivationModeLabel } from "./ui";

describe("deriveMotivationModeLabel", () => {
  it("returns initial message for slot_fill with low question count", () => {
    const label = deriveMotivationModeLabel({
      conversationMode: "slot_fill",
      questionCount: 1,
      isDraftReady: false,
      causalGapCount: 0,
    });
    expect(label).toBe("志望動機の土台を整えています");
  });

  it("returns mid-progress message for slot_fill with moderate count", () => {
    const label = deriveMotivationModeLabel({
      conversationMode: "slot_fill",
      questionCount: 4,
      isDraftReady: false,
      causalGapCount: 0,
    });
    expect(label).toBe("材料をもう少し揃えています");
  });

  it("returns ready message when isDraftReady in slot_fill", () => {
    const label = deriveMotivationModeLabel({
      conversationMode: "slot_fill",
      questionCount: 6,
      isDraftReady: true,
      causalGapCount: 0,
    });
    expect(label).toBe("材料が揃いました");
  });

  it("returns deepdive with gap count", () => {
    const label = deriveMotivationModeLabel({
      conversationMode: "deepdive",
      questionCount: 8,
      isDraftReady: true,
      causalGapCount: 2,
    });
    expect(label).toBe("補強中（残り2件）");
  });

  it("returns completed for deepdive with no gaps", () => {
    const label = deriveMotivationModeLabel({
      conversationMode: "deepdive",
      questionCount: 10,
      isDraftReady: true,
      causalGapCount: 0,
    });
    expect(label).toBe("補強完了");
  });
});
