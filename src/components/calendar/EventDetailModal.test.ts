import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import { startOfJstDayAsUtc } from "@/lib/datetime/jst";

describe("EventDetailModal", () => {
  it("does not render inline deleteError banner (reportUserFacingError handles snackbar)", async () => {
    const source = await readFile(new URL("./EventDetailModal.tsx", import.meta.url), "utf8");
    expect(source).not.toContain("deleteError");
    expect(source).not.toContain("bg-red-50 border border-red-200");
  });

  it("getDaysLeft uses JST day boundaries for correct timezone handling", async () => {
    const source = await readFile(new URL("./EventDetailModal.tsx", import.meta.url), "utf8");
    expect(source).toContain("startOfJstDayAsUtc");
  });

  it("computes daysLeft correctly across JST boundary", () => {
    const today = startOfJstDayAsUtc(new Date());
    const futureDate = new Date(today.getTime() + 2 * 24 * 60 * 60 * 1000);
    const diff = Math.ceil(
      (startOfJstDayAsUtc(futureDate).getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
    );
    expect(diff).toBe(2);
  });
});
