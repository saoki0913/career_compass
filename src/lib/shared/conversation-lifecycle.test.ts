import { describe, it, expect } from "vitest";
import {
  STANDARD_PHASES,
  INTERVIEW_PHASES,
  computePhaseItems,
  computePhaseItemsFrom,
  computeInterviewPhaseItems,
} from "./conversation-lifecycle";

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
      expect(items[3].status).toBe("done");
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

  describe("computePhaseItemsFrom", () => {
    it("marks the final phase as current (not done) when not terminal", () => {
      const items = computePhaseItemsFrom(STANDARD_PHASES, STANDARD_PHASES.length - 1, {
        isTerminal: false,
      });
      expect(items[3].status).toBe("current");
    });

    it("forces the final phase to done when terminal", () => {
      const items = computePhaseItemsFrom(STANDARD_PHASES, STANDARD_PHASES.length - 1, {
        isTerminal: true,
      });
      expect(items[3].status).toBe("done");
    });

    it("does not affect non-final phases when terminal", () => {
      const items = computePhaseItemsFrom(STANDARD_PHASES, 1, { isTerminal: true });
      expect(items[0].status).toBe("done");
      expect(items[1].status).toBe("current");
      expect(items[2].status).toBe("pending");
      expect(items[3].status).toBe("done");
    });

    it("applies doneLabel for a custom draftLabelKey when current", () => {
      const phases = [
        { key: "first", label: "First" },
        { key: "draft", label: "Draft", doneLabel: "Generated" },
      ];
      const items = computePhaseItemsFrom(phases, 1, { hasDraft: true, draftLabelKey: "draft" });
      expect(items[1].status).toBe("current");
      expect(items[1].label).toBe("Generated");
    });
  });

  describe("computeInterviewPhaseItems", () => {
    it("defines 4 interview phases in order", () => {
      expect(INTERVIEW_PHASES.map((p) => p.key)).toEqual([
        "setup",
        "questions",
        "feedback",
        "complete",
      ]);
    });

    it("marks setup as current when not started", () => {
      const items = computeInterviewPhaseItems({
        hasStarted: false,
        questionFlowCompleted: false,
        hasFeedback: false,
      });
      expect(items).toHaveLength(4);
      expect(items[0]).toMatchObject({ key: "setup", status: "current" });
      expect(items[1]).toMatchObject({ key: "questions", status: "pending" });
      expect(items[2]).toMatchObject({ key: "feedback", status: "pending" });
      expect(items[3]).toMatchObject({ key: "complete", status: "pending" });
    });

    it("marks questions as current when started", () => {
      const items = computeInterviewPhaseItems({
        hasStarted: true,
        questionFlowCompleted: false,
        hasFeedback: false,
      });
      expect(items[0]).toMatchObject({ key: "setup", status: "done" });
      expect(items[1]).toMatchObject({ key: "questions", status: "current" });
      expect(items[2]).toMatchObject({ key: "feedback", status: "pending" });
    });

    it("marks feedback as current when question flow completed", () => {
      const items = computeInterviewPhaseItems({
        hasStarted: true,
        questionFlowCompleted: true,
        hasFeedback: false,
      });
      expect(items[1]).toMatchObject({ key: "questions", status: "done" });
      expect(items[2]).toMatchObject({ key: "feedback", status: "current" });
      expect(items[3]).toMatchObject({ key: "complete", status: "pending" });
    });

    it("marks all phases done when feedback received", () => {
      const items = computeInterviewPhaseItems({
        hasStarted: true,
        questionFlowCompleted: true,
        hasFeedback: true,
      });
      expect(items.every((p) => p.status === "done")).toBe(true);
    });
  });
});
