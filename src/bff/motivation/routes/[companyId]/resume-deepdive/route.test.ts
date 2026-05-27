import { describe, expect, it } from "vitest";

describe("bff/motivation/resume-deepdive/route", () => {
  it("confirms inside the persist transaction (atomic) and rolls back on a failed claim", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile(new URL("./route.ts", import.meta.url), "utf8");
    // Persistence (conversation update) and confirmation share one db.transaction.
    expect(source).toContain("confirmReservationInTx(tx, reservationId)");
    const txBlock = source.slice(source.indexOf("await db.transaction"));
    // A non-claimable reservation throws so the whole tx (conversation update) rolls back.
    expect(txBlock).toContain("if (!confirmed)");
    expect(txBlock).toContain("throw");
    // The standalone confirm wrapper is no longer used here; refund happens in the outer catch.
    expect(source).not.toContain("await confirmReservation(reservationId)");
    expect(source).toContain("if (reservationId) await cancelReservation(reservationId);");
  });
});
