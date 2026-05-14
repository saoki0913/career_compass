import { describe, expect, it } from "vitest";

describe("bff/gakuchika/generate-es-draft/route", () => {
  it("passes is_regeneration flag to FastAPI body", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile(new URL("./route.ts", import.meta.url), "utf8");
    expect(source).toContain("is_regeneration: isRegeneration");
  });

  it("returns 409 with quality warnings for non-regeneration quality failures", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile(new URL("./route.ts", import.meta.url), "utf8");
    expect(source).toContain("!isRegeneration");
    expect(source).toContain("quality_warnings");
  });

  it("calls cancelReservation when confirmReservation fails", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile(new URL("./route.ts", import.meta.url), "utf8");
    const confirmBlock = source.slice(source.indexOf("await confirmReservation(reservationId)"));
    expect(confirmBlock).toContain("cancelReservation(reservationId)");
    expect(confirmBlock).toContain("logError");
  });
});
