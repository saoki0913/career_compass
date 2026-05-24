import { describe, it, expect } from "vitest";
import { captureRollback } from "./state-preservation";

describe("state-preservation", () => {
  describe("captureRollback", () => {
    it("snapshots only the enumerated keys", () => {
      const source = { a: 1, b: 2, c: 3 };
      const snapshot = captureRollback(source, ["a", "c"]);
      expect(snapshot.fields).toEqual({ a: 1, c: 3 });
      expect(snapshot.fields).not.toHaveProperty("b");
    });

    it("captures values at snapshot time (independent of later mutations)", () => {
      const source = { a: 1, b: 2 };
      const snapshot = captureRollback(source, ["a"]);
      source.a = 99;
      expect(snapshot.fields.a).toBe(1);
    });

    it("preserves null and false values in the snapshot", () => {
      const source: { a: number | null; b: boolean } = { a: null, b: false };
      const snapshot = captureRollback(source, ["a", "b"]);
      expect(snapshot.fields).toEqual({ a: null, b: false });
    });

    it("returns an empty snapshot when no keys are listed", () => {
      const source = { a: 1, b: 2 };
      const snapshot = captureRollback(source, []);
      expect(snapshot.fields).toEqual({});
    });
  });
});
