import { and, eq, lt, sql } from "drizzle-orm";

import {
  creditTransactions,
  credits,
  creditConsumptionAllowedSql,
  db,
  getCreditConsumptionBlockDetails,
  getCreditRow,
  isBillingGateUnavailableError,
  type CreditConsumptionBlockCode,
  type TransactionType,
} from "./shared";

/**
 * Drizzle transaction handle. Lets `confirmReservationInTx` compose with a
 * caller's `db.transaction(...)` so persistence and confirm share one commit.
 */
export type CreditsTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

type CreditReservationFailureCode =
  | CreditConsumptionBlockCode
  | "BILLING_GATE_UNAVAILABLE"
  | "CREDITS_NOT_INITIALIZED"
  | "INSUFFICIENT_CREDITS";

type CreditFailureBase = {
  success: false;
  newBalance: number;
  error: string;
  errorCode: CreditReservationFailureCode;
};

async function getCreditConsumptionFailure(
  userId: string,
): Promise<CreditFailureBase | null> {
  try {
    const billingBlock = await getCreditConsumptionBlockDetails(userId);
    if (!billingBlock) {
      return null;
    }
    const userCredits = await getCreditRow(userId);
    return {
      success: false,
      newBalance: userCredits?.balance ?? 0,
      error: billingBlock.message,
      errorCode: billingBlock.code,
    };
  } catch (error) {
    if (!isBillingGateUnavailableError(error)) {
      throw error;
    }
    const userCredits = await getCreditRow(userId);
    return {
      success: false,
      newBalance: userCredits?.balance ?? 0,
      error: error.message,
      errorCode: "BILLING_GATE_UNAVAILABLE",
    };
  }
}

export async function consumeCredits(
  userId: string,
  amount: number,
  type: TransactionType,
  referenceId?: string,
  description?: string,
): Promise<{ success: boolean; newBalance: number; error?: string; errorCode?: CreditReservationFailureCode }> {
  const now = new Date();

  const creditConsumptionFailure = await getCreditConsumptionFailure(userId);
  if (creditConsumptionFailure) {
    return creditConsumptionFailure;
  }

  return db.transaction(async (tx) => {
    const updated = await tx
      .update(credits)
      .set({
        balance: sql`${credits.balance} - ${amount}`,
        updatedAt: now,
      })
      .where(and(
        eq(credits.userId, userId),
        sql`${credits.balance} >= ${amount}`,
        creditConsumptionAllowedSql(userId),
      ))
      .returning({ newBalance: credits.balance });

    if (updated.length === 0) {
      const [userCredits] = await tx
        .select()
        .from(credits)
        .where(eq(credits.userId, userId))
        .limit(1);
      if (!userCredits) {
        return {
          success: false,
          newBalance: 0,
          error: "Credits not initialized",
          errorCode: "CREDITS_NOT_INITIALIZED",
        };
      }
      const transactionTimeFailure = await getCreditConsumptionFailure(userId);
      if (transactionTimeFailure) {
        return {
          ...transactionTimeFailure,
          newBalance: userCredits.balance,
        };
      }
      return {
        success: false,
        newBalance: userCredits.balance,
        error: `Insufficient credits. Need ${amount}, have ${userCredits.balance}`,
        errorCode: "INSUFFICIENT_CREDITS",
      };
    }

    const newBalance = updated[0].newBalance;

    await tx.insert(creditTransactions).values({
      id: crypto.randomUUID(),
      userId,
      amount: -amount,
      type,
      referenceId: referenceId || null,
      description: description || null,
      status: "applied",
      balanceAfter: newBalance,
      createdAt: now,
    });

    return { success: true, newBalance };
  });
}

export async function reserveCredits(
  userId: string,
  amount: number,
  type: TransactionType,
  referenceId?: string,
  description?: string,
): Promise<{
  success: boolean;
  reservationId: string;
  newBalance: number;
  error?: string;
  errorCode?: CreditReservationFailureCode;
}> {
  const now = new Date();

  const creditConsumptionFailure = await getCreditConsumptionFailure(userId);
  if (creditConsumptionFailure) {
    return {
      reservationId: "",
      ...creditConsumptionFailure,
    };
  }

  return db.transaction(async (tx) => {
    const updated = await tx
      .update(credits)
      .set({
        balance: sql`${credits.balance} - ${amount}`,
        updatedAt: now,
      })
      .where(and(
        eq(credits.userId, userId),
        sql`${credits.balance} >= ${amount}`,
        creditConsumptionAllowedSql(userId),
      ))
      .returning({ newBalance: credits.balance });

    if (updated.length === 0) {
      const [userCredits] = await tx
        .select()
        .from(credits)
        .where(eq(credits.userId, userId))
        .limit(1);
      if (!userCredits) {
        return {
          success: false,
          reservationId: "",
          newBalance: 0,
          error: "Credits not initialized",
          errorCode: "CREDITS_NOT_INITIALIZED",
        };
      }
      const transactionTimeFailure = await getCreditConsumptionFailure(userId);
      if (transactionTimeFailure) {
        return {
          reservationId: "",
          ...transactionTimeFailure,
          newBalance: userCredits.balance,
        };
      }
      return {
        success: false,
        reservationId: "",
        newBalance: userCredits.balance,
        error: `Insufficient credits. Need ${amount}, have ${userCredits.balance}`,
        errorCode: "INSUFFICIENT_CREDITS",
      };
    }

    const newBalance = updated[0].newBalance;
    const reservationId = crypto.randomUUID();

    await tx.insert(creditTransactions).values({
      id: reservationId,
      userId,
      amount: -amount,
      type,
      referenceId: referenceId || null,
      description: description ? `[Reserved] ${description}` : "[Reserved]",
      status: "reserved",
      operationId: referenceId || null,
      balanceAfter: newBalance,
      createdAt: now,
    });

    return { success: true, reservationId, newBalance };
  });
}

export async function confirmReservationInTx(
  tx: CreditsTransaction,
  reservationId: string,
): Promise<{ confirmed: boolean; balanceAfter: number | null }> {
  // Claim the reservation atomically: only a row still in `reserved` flips to
  // `confirmed`. A re-run, a racing cron cleanup, or a double confirm updates 0
  // rows and reports `confirmed: false`. `balanceAfter` is intentionally left at
  // the reserve-time snapshot because confirm never mutates `credits.balance`
  // (the deduction already happened in `reserveCredits`).
  const [claimed] = await tx
    .update(creditTransactions)
    .set({
      status: "confirmed",
      description: sql`replace(coalesce(${creditTransactions.description}, '[Reserved]'), '[Reserved]', '[Confirmed]')`,
    })
    .where(and(
      eq(creditTransactions.id, reservationId),
      eq(creditTransactions.status, "reserved"),
    ))
    .returning({
      id: creditTransactions.id,
      balanceAfter: creditTransactions.balanceAfter,
    });

  return claimed
    ? { confirmed: true, balanceAfter: claimed.balanceAfter }
    : { confirmed: false, balanceAfter: null };
}

/**
 * Standalone confirm for callers without a surrounding persistence transaction.
 * Prefer `confirmReservationInTx` inside the same `db.transaction` that persists
 * the produced artifact so "saved" and "charged" share one commit boundary.
 */
export async function confirmReservation(
  reservationId: string,
): Promise<{ confirmed: boolean }> {
  return db.transaction(async (tx) => {
    const { confirmed } = await confirmReservationInTx(tx, reservationId);
    return { confirmed };
  });
}

export async function cancelReservation(
  reservationId: string,
): Promise<{ canceled: boolean; refundedAmount: number }> {
  return db.transaction(async (tx) => {
    const now = new Date();
    const [claimedReservation] = await tx
      .update(creditTransactions)
      .set({
        description: sql`replace(${creditTransactions.description}, '[Reserved]', '[Cancelling]')`,
        status: "canceling",
      })
      .where(
        and(
          eq(creditTransactions.id, reservationId),
          eq(creditTransactions.status, "reserved"),
        ),
      )
      .returning({
        userId: creditTransactions.userId,
        amount: creditTransactions.amount,
        description: creditTransactions.description,
        balanceAfter: creditTransactions.balanceAfter,
      });

    if (!claimedReservation) {
      return { canceled: false, refundedAmount: 0 };
    }

    const refundAmount = Math.abs(claimedReservation.amount);
    const [updatedCredits] = await tx
      .update(credits)
      .set({
        balance: sql`${credits.balance} + ${refundAmount}`,
        updatedAt: now,
      })
      .where(eq(credits.userId, claimedReservation.userId))
      .returning({ balance: credits.balance });

    if (!updatedCredits) {
      throw new Error(`Cannot cancel credit reservation without credits row: ${reservationId}`);
    }

    await tx
      .update(creditTransactions)
      .set({
        description: (claimedReservation.description ?? "[Cancelling]").replace(
          "[Cancelling]",
          "[Cancelled/Refunded]",
        ),
        status: "canceled",
        balanceAfter: updatedCredits.balance,
      })
      .where(eq(creditTransactions.id, reservationId));

    return { canceled: true, refundedAmount: refundAmount };
  });
}

const CLEANUP_BATCH_LIMIT = 100;

export async function cleanupExpiredReservations(
  cutoffMinutes: number,
): Promise<{ canceledCount: number; totalRefunded: number; errors: string[] }> {
  const cutoff = new Date(Date.now() - cutoffMinutes * 60 * 1000);

  const expired = await db
    .select({ id: creditTransactions.id })
    .from(creditTransactions)
    .where(
      and(
        eq(creditTransactions.status, "reserved"),
        lt(creditTransactions.createdAt, cutoff),
      ),
    )
    .limit(CLEANUP_BATCH_LIMIT);

  let canceledCount = 0;
  let totalRefunded = 0;
  const errors: string[] = [];

  for (const row of expired) {
    try {
      const result = await cancelReservation(row.id);
      if (result.canceled) {
        canceledCount++;
        totalRefunded += result.refundedAmount;
      }
    } catch (error) {
      errors.push(`${row.id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return { canceledCount, totalRefunded, errors };
}
