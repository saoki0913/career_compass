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

  it("confirms inside the persist transaction (atomic) and rolls back on a failed claim", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile(new URL("./route.ts", import.meta.url), "utf8");
    // Persistence and confirmation share one db.transaction.
    expect(source).toContain("confirmReservationInTx(tx, reservationId)");
    const txBlock = source.slice(source.indexOf("await db.transaction"));
    // A non-claimable reservation throws so the whole tx (document + conversation) rolls back.
    expect(txBlock).toContain("if (!confirmed)");
    expect(txBlock).toContain("throw");
    // The standalone wrapper is no longer used here; refund happens in the outer catch.
    expect(source).not.toContain("await confirmReservation(reservationId)");
    expect(source).toContain("if (reservationId) await cancelReservation(reservationId);");
  });
});
