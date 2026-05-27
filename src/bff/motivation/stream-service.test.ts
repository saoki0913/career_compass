import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";

const SRC_PATH = new URL("./stream-service.ts", import.meta.url);

/**
 * Source-level invariants for the motivation stream confirm path (Phase 4
 * atomic billing). Mirrors the source-based assertions used for the other
 * persist-then-confirm sites (gakuchika es-draft, interview-summary,
 * turn-service): the conversation UPDATE and the credit confirm must share one
 * db.transaction so "saved" and "charged" commit together.
 */
describe("completeMotivationStreamTurn billing atomicity", () => {
  it("confirms inside the same db.transaction that persists the conversation", async () => {
    const source = await readFile(SRC_PATH, "utf8");

    // Persist + confirm share a single transaction.
    expect(source).toContain("await db.transaction");
    // The tx-bound confirm primitive is used (not the standalone confirm).
    expect(source).toContain("motivationStreamPolicy.confirmInTx(");
    expect(source).not.toContain("motivationStreamPolicy.confirm(");

    const txStart = source.indexOf("await db.transaction");
    const txBlock = source.slice(txStart, source.indexOf("const billingStatus"));
    // confirmInTx is invoked with the transaction handle inside the tx block.
    expect(txBlock).toContain("confirmInTx(");
    expect(txBlock).toContain("tx,");
    // The optimistic-locked conversation UPDATE runs inside the transaction.
    expect(txBlock).toContain("tx\n        .update(motivationConversations)");
    expect(txBlock).toContain("motivationConversations.updatedAt");
  });

  it("treats an optimistic-lock conflict as a cancel:true refund without charging", async () => {
    const source = await readFile(SRC_PATH, "utf8");
    // The stale-conversation conflict still returns a cancel:true error event so
    // sse-proxy stops and onFinally refunds; billingStatus must be "failed".
    expect(source).toContain("cancel: true");
    expect(source).toContain('billingStatus: "failed"');
  });

  it("types the billing context off confirmInTx (index 1), not the removed confirm", async () => {
    const source = await readFile(SRC_PATH, "utf8");
    expect(source).toContain("Parameters<typeof motivationStreamPolicy.confirmInTx>[1]");
    expect(source).not.toContain("Parameters<typeof motivationStreamPolicy.confirm>[0]");
  });
});
