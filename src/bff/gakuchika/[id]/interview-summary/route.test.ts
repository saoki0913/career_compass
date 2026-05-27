import { describe, expect, it } from "vitest";

describe("bff/gakuchika/interview-summary/route", () => {
  it("confirms inside the persist transaction (atomic) and rolls back on a failed claim", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile(new URL("./route.ts", import.meta.url), "utf8");
    // Persistence (summary + conversation) and confirmation share one db.transaction.
    expect(source).toContain("confirmReservationInTx(tx, reservationId)");
    const txBlock = source.slice(source.indexOf("await db.transaction"));
    // A non-claimable reservation throws so the whole tx rolls back.
    expect(txBlock).toContain("if (!confirmed)");
    expect(txBlock).toContain("throw");
    // The standalone confirm wrapper is no longer used; refund happens in the outer catch.
    expect(source).not.toContain("await confirmReservation(reservationId)");
    expect(source).not.toContain("confirmReservation,");
  });

  it("refunds in the outer catch when the persist/confirm transaction throws", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile(new URL("./route.ts", import.meta.url), "utf8");
    const catchBlock = source.slice(source.lastIndexOf("} catch (error) {"));
    expect(catchBlock).toContain("await cancelReservation(reservationId)");
  });

  it("charges only after the atomic transaction succeeds", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile(new URL("./route.ts", import.meta.url), "utf8");
    expect(source).toContain("let creditsUsed = 0;");
    expect(source).toContain("if (reservationId) creditsUsed = FEEDBACK_SUMMARY_CREDIT_COST;");
  });
});
