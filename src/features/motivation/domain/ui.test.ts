import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";

describe("features/motivation/domain/ui re-exports", () => {
  it("does not re-export removed lifecycle utilities", async () => {
    const source = await readFile(new URL("./ui.ts", import.meta.url), "utf8");
    expect(source).not.toContain("getMotivationLifecyclePhase");
    expect(source).not.toContain("getMotivationPhaseStatus");
    expect(source).not.toContain("MOTIVATION_LIFECYCLE_PHASES");
  });

  it("re-exports core motivation utilities", async () => {
    const source = await readFile(new URL("./ui.ts", import.meta.url), "utf8");
    expect(source).toContain("deriveMotivationModeLabel");
    expect(source).toContain("getMotivationSlotPillStatus");
    expect(source).toContain("STAGE_ORDER");
    expect(source).toContain("SLOT_PILL_LABELS");
    expect(source).toContain("STAGE_LABELS");
  });
});
