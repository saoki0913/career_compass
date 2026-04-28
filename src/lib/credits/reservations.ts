import { and, eq, sql } from "drizzle-orm";

import {
  creditTransactions,
  credits,
  db,
  getCreditRow,
  type TransactionType,
} from "./shared";

export async function consumeCredits(
  userId: string,
  amount: number,
  type: TransactionType,
  referenceId?: string,
  description?: string,
): Promise<{ success: boolean; newBalance: number; error?: string }> {
  const now = new Date();

  const updated = await db
    .update(credits)
    .set({
      balance: sql`${credits.balance} - ${amount}`,
      updatedAt: now,
    })
    .where(and(eq(credits.userId, userId), sql`${credits.balance} >= ${amount}`))
    .returning({ newBalance: credits.balance });

  if (updated.length === 0) {
    const userCredits = await getCreditRow(userId);
    if (!userCredits) {
      return { success: false, newBalance: 0, error: "Credits not initialized" };
    }
    return {
      success: false,
      newBalance: userCredits.balance,
      error: `Insufficient credits. Need ${amount}, have ${userCredits.balance}`,
    };
  }

  const newBalance = updated[0].newBalance;

  await db.insert(creditTransactions).values({
    id: crypto.randomUUID(),
    userId,
    amount: -amount,
    type,
    referenceId: referenceId || null,
    description: description || null,
    balanceAfter: newBalance,
    createdAt: now,
  });

  return { success: true, newBalance };
}

export async function reserveCredits(
  userId: string,
  amount: number,
  type: TransactionType,
  referenceId?: string,
  description?: string,
): Promise<{ success: boolean; reservationId: string; newBalance: number; error?: string }> {
  const now = new Date();

  const updated = await db
    .update(credits)
    .set({
      balance: sql`${credits.balance} - ${amount}`,
      updatedAt: now,
    })
    .where(and(eq(credits.userId, userId), sql`${credits.balance} >= ${amount}`))
    .returning({ newBalance: credits.balance });

  if (updated.length === 0) {
    const userCredits = await getCreditRow(userId);
    if (!userCredits) {
      return { success: false, reservationId: "", newBalance: 0, error: "Credits not initialized" };
    }
    return {
      success: false,
      reservationId: "",
      newBalance: userCredits.balance,
      error: `Insufficient credits. Need ${amount}, have ${userCredits.balance}`,
    };
  }

  const newBalance = updated[0].newBalance;
  const reservationId = crypto.randomUUID();

  await db.insert(creditTransactions).values({
    id: reservationId,
    userId,
    amount: -amount,
    type,
    referenceId: referenceId || null,
    description: description ? `[Reserved] ${description}` : "[Reserved]",
    balanceAfter: newBalance,
    createdAt: now,
  });

  return { success: true, reservationId, newBalance };
}

export async function confirmReservation(reservationId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const [reservation] = await tx
      .select()
      .from(creditTransactions)
      .where(eq(creditTransactions.id, reservationId))
      .limit(1);
    if (!reservation) return;

    const [userCredits] = await tx
      .select()
      .from(credits)
      .where(eq(credits.userId, reservation.userId))
      .limit(1);

    await tx
      .update(creditTransactions)
      .set({
        description: reservation.description?.replace("[Reserved]", "[Confirmed]") || "[Confirmed]",
        balanceAfter: userCredits?.balance ?? reservation.balanceAfter,
      })
      .where(eq(creditTransactions.id, reservationId));
  });
}

export async function cancelReservation(reservationId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const now = new Date();
    const [claimedReservation] = await tx
      .update(creditTransactions)
      .set({
        description: sql`replace(${creditTransactions.description}, '[Reserved]', '[Cancelling]')`,
      })
      .where(
        and(
          eq(creditTransactions.id, reservationId),
          sql`${creditTransactions.description} like '%[Reserved]%'`,
        ),
      )
      .returning({
        userId: creditTransactions.userId,
        amount: creditTransactions.amount,
        description: creditTransactions.description,
        balanceAfter: creditTransactions.balanceAfter,
      });

    if (!claimedReservation) {
      return;
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
        balanceAfter: updatedCredits.balance,
      })
      .where(eq(creditTransactions.id, reservationId));
  });
}
