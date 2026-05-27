import { describe, expect, it } from "vitest";

import type { CreditsTransaction } from "@/lib/credits";
import type {
  BillingOutcome,
  BillingPolicy,
  BillingPrecheckResult,
  BillingReserveResult,
} from "./types";

/**
 * Contract-level conformance checks for `BillingPolicy`.
 *
 * `types.ts` is type-only, so these assertions are compile-time: a policy must
 * expose `confirmInTx(tx, ctx, outcome, reservationId)` to satisfy the
 * interface. The runtime body just keeps Vitest happy; tsc is the real gate for
 * the contract.
 */
describe("BillingPolicy contract", () => {
  it("requires confirmInTx (tx-bound) on every policy implementation", () => {
    const calls: string[] = [];
    const policy: BillingPolicy<{ id: string }> = {
      async precheck(): Promise<BillingPrecheckResult> {
        return { ok: true, freeQuotaAvailable: false };
      },
      async reserve(): Promise<BillingReserveResult> {
        return { reservationId: "res-1" };
      },
      async confirm(): Promise<void> {
        calls.push("confirm");
      },
      async confirmInTx(
        _tx: CreditsTransaction,
        _ctx: { id: string },
        outcome: BillingOutcome,
        reservationId: string | null,
      ): Promise<void> {
        calls.push(`confirmInTx:${outcome.kind}:${reservationId}`);
      },
      async cancel(): Promise<void> {
        calls.push("cancel");
      },
    };

    expect(typeof policy.confirmInTx).toBe("function");
    expect(typeof policy.cancel).toBe("function");
  });
});
