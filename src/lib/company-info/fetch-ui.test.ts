import { describe, expect, it } from "vitest";

import {
  shouldCloseCorporateFetchModalOnSuccess,
  shouldCloseScheduleFetchModalOnResult,
} from "@/lib/company-info/fetch-ui";

describe("company-info/fetch-ui", () => {
  it("closes the corporate fetch modal only for successful ingests", () => {
    expect(shouldCloseCorporateFetchModalOnSuccess({ success: true, chunksStored: 12 })).toBe(true);
    expect(shouldCloseCorporateFetchModalOnSuccess({ success: true, chunksStored: 0 })).toBe(true);
    expect(shouldCloseCorporateFetchModalOnSuccess({ success: false, chunksStored: 0 })).toBe(false);
  });

  it("closes the schedule fetch modal for completed non-error outcomes", () => {
    expect(shouldCloseScheduleFetchModalOnResult("success")).toBe(true);
    expect(shouldCloseScheduleFetchModalOnResult("duplicates_only")).toBe(true);
    expect(shouldCloseScheduleFetchModalOnResult("no_deadlines")).toBe(true);
    expect(shouldCloseScheduleFetchModalOnResult("error")).toBe(false);
  });
});
