/**
 * Credits Management Library
 *
 * Handles credit balance, transactions, and daily free usage tracking.
 * Important: Credits are only consumed on successful operations.
 */

import { db } from "@/lib/db";
import { credits, creditTransactions, dailyFreeUsage, userProfiles } from "@/lib/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { calculateESReviewCost } from "./cost";

// Plan-based credit allocations
export const PLAN_CREDITS = {
  guest: 15,
  free: 30,
  standard: 300,
  pro: 800,
} as const;

// Daily free company fetch limits
export const DAILY_FREE_COMPANY_FETCH = {
  guest: 2,
  user: 3, // Free/Standard/Pro all get 3 free fetches per day
} as const;

export type PlanType = "guest" | "free" | "standard" | "pro";
export type TransactionType = "monthly_grant" | "plan_change" | "company_fetch" | "es_review" | "gakuchika" | "gakuchika_draft" | "motivation" | "motivation_draft" | "refund";

/**
 * Get the current date in JST (YYYY-MM-DD format)
 */
export function getJSTDateString(): string {
  const now = new Date();
  const jstOffset = 9 * 60; // JST is UTC+9
  const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
  const jst = new Date(utc + (jstOffset * 60000));
  return jst.toISOString().split("T")[0];
}

/**
 * Get the next monthly reset date based on the last reset date
 */
export function getNextResetDate(lastResetAt: Date): Date {
  const next = new Date(lastResetAt);
  next.setMonth(next.getMonth() + 1);
  return next;
}

/**
 * Check if monthly credits should be granted
 */
export function shouldGrantMonthlyCredits(lastResetAt: Date): boolean {
  const now = new Date();
  const nextReset = getNextResetDate(lastResetAt);
  return now >= nextReset;
}

/**
 * Initialize credits for a new user
 */
export async function initializeCredits(userId: string, plan: PlanType = "free") {
  const allocation = PLAN_CREDITS[plan];
  const now = new Date();

  await db.insert(credits).values({
    id: crypto.randomUUID(),
    userId,
    balance: allocation,
    monthlyAllocation: allocation,
    lastResetAt: now,
    createdAt: now,
    updatedAt: now,
  });

  // Record initial grant transaction
  await db.insert(creditTransactions).values({
    id: crypto.randomUUID(),
    userId,
    amount: allocation,
    type: "monthly_grant",
    description: "Initial credit allocation",
    balanceAfter: allocation,
    createdAt: now,
  });
}

/**
 * Get user's current credits info
 */
export async function getCreditsInfo(userId: string) {
  const [userCredits] = await db
    .select()
    .from(credits)
    .where(eq(credits.userId, userId))
    .limit(1);

  if (!userCredits) {
    // Get user's plan and initialize credits
    const [profile] = await db
      .select()
      .from(userProfiles)
      .where(eq(userProfiles.userId, userId))
      .limit(1);

    const plan = (profile?.plan || "free") as PlanType;
    await initializeCredits(userId, plan);

    // Fetch the newly created credits
    const [newCredits] = await db
      .select()
      .from(credits)
      .where(eq(credits.userId, userId))
      .limit(1);

    if (!newCredits) {
      throw new Error("Failed to initialize credits");
    }

    return {
      balance: newCredits.balance,
      monthlyAllocation: newCredits.monthlyAllocation,
      lastResetAt: newCredits.lastResetAt,
      nextResetAt: getNextResetDate(newCredits.lastResetAt),
    };
  }

  // Check if monthly reset is needed
  if (shouldGrantMonthlyCredits(userCredits.lastResetAt)) {
    await grantMonthlyCredits(userId);
    // Re-fetch after granting
    const [updatedCredits] = await db
      .select()
      .from(credits)
      .where(eq(credits.userId, userId))
      .limit(1);

    if (updatedCredits) {
      return {
        balance: updatedCredits.balance,
        monthlyAllocation: updatedCredits.monthlyAllocation,
        lastResetAt: updatedCredits.lastResetAt,
        nextResetAt: getNextResetDate(updatedCredits.lastResetAt),
      };
    }
  }

  return {
    balance: userCredits.balance,
    monthlyAllocation: userCredits.monthlyAllocation,
    lastResetAt: userCredits.lastResetAt,
    nextResetAt: getNextResetDate(userCredits.lastResetAt),
  };
}

/**
 * Grant monthly credits (reset balance to monthly allocation)
 */
export async function grantMonthlyCredits(userId: string) {
  const [userCredits] = await db
    .select()
    .from(credits)
    .where(eq(credits.userId, userId))
    .limit(1);

  if (!userCredits) {
    return;
  }

  const now = new Date();
  const newBalance = userCredits.monthlyAllocation;

  await db
    .update(credits)
    .set({
      balance: newBalance,
      lastResetAt: now,
      updatedAt: now,
    })
    .where(eq(credits.userId, userId));

  // Record grant transaction
  await db.insert(creditTransactions).values({
    id: crypto.randomUUID(),
    userId,
    amount: newBalance,
    type: "monthly_grant",
    description: "Monthly credit reset",
    balanceAfter: newBalance,
    createdAt: now,
  });
}

/**
 * Update user's monthly allocation when plan changes
 */
export async function updatePlanAllocation(userId: string, newPlan: PlanType) {
  const allocation = PLAN_CREDITS[newPlan];
  const now = new Date();

  const [userCredits] = await db
    .select()
    .from(credits)
    .where(eq(credits.userId, userId))
    .limit(1);

  if (!userCredits) {
    await initializeCredits(userId, newPlan);
    return;
  }

  // On plan change: reset balance to new allocation and reset date
  await db
    .update(credits)
    .set({
      balance: allocation,
      monthlyAllocation: allocation,
      lastResetAt: now,
      updatedAt: now,
    })
    .where(eq(credits.userId, userId));

  // Record plan change transaction
  await db.insert(creditTransactions).values({
    id: crypto.randomUUID(),
    userId,
    amount: allocation - userCredits.balance,
    type: "plan_change",
    description: `Plan changed to ${newPlan}`,
    balanceAfter: allocation,
    createdAt: now,
  });
}

/**
 * Consume credits (only call on successful operations)
 * Uses atomic UPDATE with WHERE balance >= amount to prevent race conditions.
 * Returns false if insufficient credits.
 */
export async function consumeCredits(
  userId: string,
  amount: number,
  type: TransactionType,
  referenceId?: string,
  description?: string
): Promise<{ success: boolean; newBalance: number; error?: string }> {
  const now = new Date();

  // Atomic: deduct balance only if sufficient, return updated row
  const updated = await db
    .update(credits)
    .set({
      balance: sql`${credits.balance} - ${amount}`,
      updatedAt: now,
    })
    .where(
      and(
        eq(credits.userId, userId),
        sql`${credits.balance} >= ${amount}`
      )
    )
    .returning({ newBalance: credits.balance });

  if (updated.length === 0) {
    // Either user not found or insufficient balance
    const [userCredits] = await db
      .select({ balance: credits.balance })
      .from(credits)
      .where(eq(credits.userId, userId))
      .limit(1);

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

  // Record consumption transaction
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

/**
 * Get daily free usage for a user or guest
 */
export async function getDailyFreeUsage(userId: string | null, guestId: string | null) {
  const today = getJSTDateString();

  const whereClause = userId
    ? and(eq(dailyFreeUsage.userId, userId), eq(dailyFreeUsage.date, today))
    : guestId
    ? and(eq(dailyFreeUsage.guestId, guestId), eq(dailyFreeUsage.date, today))
    : null;

  if (!whereClause) {
    return { companyFetchCount: 0 };
  }

  const [usage] = await db
    .select()
    .from(dailyFreeUsage)
    .where(whereClause)
    .limit(1);

  return {
    companyFetchCount: usage?.companyFetchCount || 0,
  };
}

/**
 * Get remaining daily free company fetches
 */
export async function getRemainingFreeFetches(userId: string | null, guestId: string | null) {
  const usage = await getDailyFreeUsage(userId, guestId);
  const limit = userId ? DAILY_FREE_COMPANY_FETCH.user : DAILY_FREE_COMPANY_FETCH.guest;
  return Math.max(0, limit - usage.companyFetchCount);
}

/**
 * Increment daily free usage (only call on successful operations)
 * Uses atomic UPDATE to prevent race conditions. Falls back to INSERT if no row exists.
 */
export async function incrementDailyFreeUsage(
  userId: string | null,
  guestId: string | null,
  field: "companyFetchCount"
) {
  const today = getJSTDateString();

  const whereClause = userId
    ? and(eq(dailyFreeUsage.userId, userId), eq(dailyFreeUsage.date, today))
    : guestId
    ? and(eq(dailyFreeUsage.guestId, guestId), eq(dailyFreeUsage.date, today))
    : null;

  if (!whereClause) {
    return;
  }

  // Atomic increment: UPDATE ... SET field = field + 1
  const updated = await db
    .update(dailyFreeUsage)
    .set({
      [field]: sql`${dailyFreeUsage[field]} + 1`,
    })
    .where(whereClause)
    .returning({ id: dailyFreeUsage.id });

  if (updated.length === 0) {
    // No existing row for today — insert new record
    try {
      await db.insert(dailyFreeUsage).values({
        id: crypto.randomUUID(),
        userId: userId || null,
        guestId: guestId || null,
        date: today,
        [field]: 1,
        createdAt: new Date(),
      });
    } catch (err: unknown) {
      // If a concurrent request already inserted, retry the atomic update
      // - Postgres: code 23505
      // - SQLite/libSQL: message includes "UNIQUE constraint failed"
      const pgCode = (err as { code?: unknown } | null)?.code;
      const message = err instanceof Error ? err.message : "";
      const isUniqueViolation =
        pgCode === "23505" || message.toLowerCase().includes("unique");

      if (isUniqueViolation) {
        await db
          .update(dailyFreeUsage)
          .set({
            [field]: sql`${dailyFreeUsage[field]} + 1`,
          })
          .where(whereClause);
      } else {
        throw err;
      }
    }
  }
}

export { calculateESReviewCost };

/**
 * Check if user has enough credits for an operation
 */
export async function hasEnoughCredits(userId: string, amount: number): Promise<boolean> {
  const info = await getCreditsInfo(userId);
  return info.balance >= amount;
}

/**
 * Consume partial credits (0.5 credit support)
 * Each call adds 0.5 (1 accumulator unit). When accumulator reaches 2, deduct 1 full credit.
 * Uses atomic UPDATE to prevent race conditions on the accumulator.
 * Use case: When deadline extraction fails but other items are extracted
 */
export async function consumePartialCredits(
  userId: string,
  type: TransactionType,
  referenceId?: string,
  description?: string
): Promise<{ success: boolean; newBalance: number; actualConsumed: number }> {
  const now = new Date();

  // Try atomic increment of accumulator (only if accumulator < 1, i.e. will stay below threshold)
  const incremented = await db
    .update(credits)
    .set({
      partialCreditAccumulator: sql`${credits.partialCreditAccumulator} + 1`,
      updatedAt: now,
    })
    .where(
      and(
        eq(credits.userId, userId),
        sql`${credits.partialCreditAccumulator} < 1`
      )
    )
    .returning({ newBalance: credits.balance, accumulator: credits.partialCreditAccumulator });

  if (incremented.length > 0) {
    // Accumulator was 0, now 1 — no credit deduction needed yet
    return { success: true, newBalance: incremented[0].newBalance, actualConsumed: 0 };
  }

  // Accumulator is >= 1, so this increment would reach >= 2 — deduct 1 credit and reset
  const deducted = await db
    .update(credits)
    .set({
      balance: sql`${credits.balance} - 1`,
      partialCreditAccumulator: 0,
      updatedAt: now,
    })
    .where(
      and(
        eq(credits.userId, userId),
        sql`${credits.balance} >= 1`
      )
    )
    .returning({ newBalance: credits.balance });

  if (deducted.length === 0) {
    // Insufficient balance for deduction
    const [userCredits] = await db
      .select({ balance: credits.balance })
      .from(credits)
      .where(eq(credits.userId, userId))
      .limit(1);
    return { success: false, newBalance: userCredits?.balance ?? 0, actualConsumed: 0 };
  }

  const newBalance = deducted[0].newBalance;

  await db.insert(creditTransactions).values({
    id: crypto.randomUUID(),
    userId,
    amount: -1,
    type,
    referenceId: referenceId || null,
    description: description || "Partial credit (0.5 x 2)",
    balanceAfter: newBalance,
    createdAt: now,
  });

  return { success: true, newBalance, actualConsumed: 1 };
}

/**
 * Reserve credits before a long-running operation.
 * Atomically deducts balance upfront. Use confirmReservation() on success
 * or cancelReservation() on failure to refund.
 */
export async function reserveCredits(
  userId: string,
  amount: number,
  type: TransactionType,
  referenceId?: string,
  description?: string
): Promise<{ success: boolean; reservationId: string; newBalance: number; error?: string }> {
  const now = new Date();

  // Atomic deduction
  const updated = await db
    .update(credits)
    .set({
      balance: sql`${credits.balance} - ${amount}`,
      updatedAt: now,
    })
    .where(
      and(
        eq(credits.userId, userId),
        sql`${credits.balance} >= ${amount}`
      )
    )
    .returning({ newBalance: credits.balance });

  if (updated.length === 0) {
    const [userCredits] = await db
      .select({ balance: credits.balance })
      .from(credits)
      .where(eq(credits.userId, userId))
      .limit(1);

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

  // Record as reserved transaction
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

/**
 * Confirm a credit reservation after successful operation.
 * Marks the transaction as confirmed.
 */
export async function confirmReservation(reservationId: string): Promise<void> {
  const [tx] = await db
    .select()
    .from(creditTransactions)
    .where(eq(creditTransactions.id, reservationId))
    .limit(1);

  if (!tx) return;

  // Get current balance for accurate balanceAfter
  const [userCredits] = await db
    .select({ balance: credits.balance })
    .from(credits)
    .where(eq(credits.userId, tx.userId))
    .limit(1);

  await db
    .update(creditTransactions)
    .set({
      description: tx.description?.replace("[Reserved]", "[Confirmed]") || "[Confirmed]",
      balanceAfter: userCredits?.balance ?? tx.balanceAfter,
    })
    .where(eq(creditTransactions.id, reservationId));
}

/**
 * Cancel a credit reservation and refund the deducted amount.
 * Only refunds if the transaction is still in Reserved state.
 */
export async function cancelReservation(reservationId: string): Promise<void> {
  const [tx] = await db
    .select()
    .from(creditTransactions)
    .where(eq(creditTransactions.id, reservationId))
    .limit(1);

  if (!tx || !tx.description?.includes("[Reserved]")) return;

  const refundAmount = Math.abs(tx.amount);

  // Atomically refund balance
  await db
    .update(credits)
    .set({
      balance: sql`${credits.balance} + ${refundAmount}`,
      updatedAt: new Date(),
    })
    .where(eq(credits.userId, tx.userId));

  // Mark transaction as cancelled
  await db
    .update(creditTransactions)
    .set({
      description: tx.description.replace("[Reserved]", "[Cancelled/Refunded]"),
    })
    .where(eq(creditTransactions.id, reservationId));
}
