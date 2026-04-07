import { describe, expect, it } from "vitest";
import { getGakuchikaListStatusKey } from "./list-status";

describe("getGakuchikaListStatusKey", () => {
  it("treats null, undefined, and blank as not_started", () => {
    expect(getGakuchikaListStatusKey(null)).toBe("not_started");
    expect(getGakuchikaListStatusKey(undefined)).toBe("not_started");
    expect(getGakuchikaListStatusKey("")).toBe("not_started");
    expect(getGakuchikaListStatusKey("   ")).toBe("not_started");
  });

  it("maps known statuses", () => {
    expect(getGakuchikaListStatusKey("in_progress")).toBe("in_progress");
    expect(getGakuchikaListStatusKey("completed")).toBe("completed");
  });

  it("maps unknown strings to not_started", () => {
    expect(getGakuchikaListStatusKey("bogus")).toBe("not_started");
  });
});
