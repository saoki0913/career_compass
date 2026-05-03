import { describe, expect, it } from "vitest";
import { parseJsonRecordCompat, parseStringArrayCompat } from "./jsonb-compat";

describe("jsonb compat helpers", () => {
  it("reads legacy JSON strings and parsed jsonb arrays", () => {
    expect(parseStringArrayCompat('["ES提出","面接"]')).toEqual(["ES提出", "面接"]);
    expect(parseStringArrayCompat(["ES提出", "面接"])).toEqual(["ES提出", "面接"]);
    expect(parseStringArrayCompat(["ES提出", 1, null])).toEqual(["ES提出"]);
    expect(parseStringArrayCompat("not-json")).toEqual([]);
  });

  it("reads legacy JSON strings and parsed jsonb records", () => {
    expect(parseJsonRecordCompat('{"deadlineId":"d1"}')).toEqual({ deadlineId: "d1" });
    expect(parseJsonRecordCompat({ deadlineId: "d1" })).toEqual({ deadlineId: "d1" });
    expect(parseJsonRecordCompat(["not", "record"])).toBeNull();
    expect(parseJsonRecordCompat("not-json")).toBeNull();
  });
});
