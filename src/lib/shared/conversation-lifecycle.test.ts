import { describe, it, expect } from "vitest";
import { STANDARD_PHASES, computePhaseItems } from "./conversation-lifecycle";

describe("conversation-lifecycle", () => {
  describe("STANDARD_PHASES", () => {
    it("defines exactly 4 phases in order", () => {
      expect(STANDARD_PHASES).toHaveLength(4);
      expect(STANDARD_PHASES.map((p) => p.key)).toEqual([
        "questioning",
        "draft_ready",
        "deep_dive",
        "completed",
      ]);
    });

    it("provides doneLabel only for draft_ready", () => {
      const withDone = STANDARD_PHASES.filter((p) => p.doneLabel);
      expect(withDone).toHaveLength(1);
      expect(withDone[0].key).toBe("draft_ready");
    });
  });

  describe("computePhaseItems", () => {
    it("marks all phases as pending when current is questioning", () => {
      const items = computePhaseItems("questioning");
      expect(items[0].status).toBe("current");
      expect(items[1].status).toBe("pending");
      expect(items[2].status).toBe("pending");
      expect(items[3].status).toBe("pending");
    });

    it("marks prior phases as done when current is deep_dive", () => {
      const items = computePhaseItems("deep_dive");
      expect(items[0].status).toBe("done");
      expect(items[1].status).toBe("done");
      expect(items[2].status).toBe("current");
      expect(items[3].status).toBe("pending");
    });

    it("marks all phases as done when current is completed", () => {
      const items = computePhaseItems("completed");
      expect(items[0].status).toBe("done");
      expect(items[1].status).toBe("done");
      expect(items[2].status).toBe("done");
      expect(items[3].status).toBe("current");
    });

    it("uses doneLabel for draft_ready when hasDraft is true and phase is done", () => {
      const items = computePhaseItems("deep_dive", true);
      expect(items[1].label).toBe("ES生成済み");
    });

    it("uses regular label for draft_ready when hasDraft is false", () => {
      const items = computePhaseItems("deep_dive", false);
      expect(items[1].label).toBe("ES作成可");
    });

    it("uses doneLabel for draft_ready when current and hasDraft is true", () => {
      const items = computePhaseItems("draft_ready", true);
      expect(items[1].status).toBe("current");
      expect(items[1].label).toBe("ES生成済み");
    });

    it("returns PhaseItem objects with key, label, and status", () => {
      const items = computePhaseItems("questioning");
      for (const item of items) {
        expect(item).toHaveProperty("key");
        expect(item).toHaveProperty("label");
        expect(item).toHaveProperty("status");
      }
    });
  });
});
