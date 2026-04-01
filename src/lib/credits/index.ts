/**
 * Credits Management Library
 *
 * Handles credit balance, transactions, and monthly schedule free quota (company_info_monthly_usage).
 * Important: Credits are only consumed on successful operations.
 */

import { db } from "@/lib/db";
import { credits, creditTransactions, userProfiles } from "@/lib/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { calculateESReviewCost } from "./cost";
import type { PaidPlan } from "@/lib/company-info/pricing";
import { getRemainingMonthlyScheduleFreeFetchesSafe } from "@/lib/company-info/usage";

// Plan-based credit allocations
export const PLAN_CREDITS = {
  // Guest は AI 機能を利用しない（クレジット表示用に 0）
  guest: 0,
  free: 30,
  standard: 100,
  pro: 300,
} as const;

export type PlanType = "guest" | "free" | "standard" | "pro";
export type TransactionType =
  | "monthly_grant"
  | "plan_change"
  | "company_fetch"
  | "es_review"
  | "gakuchika"
  | "gakuchika_draft"
  | "motivation"
  | "motivation_draft"
  | "interview_feedback"
  | "refund";

export const DEFAULT_INTERVIEW_SESSION_CREDIT_COST = 6;

/**
 * Get the current date in JST (YYYY-MM-DD format)
 */
export function getJSTDateString(): string {
  const jst = new Date(Date.now() + (9 * 60 * 60 * 1000));
  return jst.toISOString().split("T")[0];
}

/**
 * Get the current JST month key (YYYY-MM)
 */
export function getJSTMonthKey(date: Date = new Date()): string {
  const jst = new Date(date.getTime() + (9 * 60 * 60 * 1000));
  return jst.toISOString().slice(0, 7);
}

/**
 * Get the next monthly reset date based on JST month boundaries.
 */
export function getNextResetDate(referenceDate: Date = new Date()): Date {
  const jstOffsetMs = 9 * 60 * 60 * 1000;
  const jstReference = new Date(referenceDate.getTime() + jstOffsetMs);
  const nextMonthStartUtc = Date.UTC(
    jstReference.getUTCFullYear(),
    jstReference.getUTCMonth() + 1,
    1,
    0,
    0,
    0,
    0
  );
  return new Date(nextMonthStartUtc - jstOffsetMs);
}

/**
 * Check if monthly credits should be granted
 */
export function shouldGrantMonthlyCredits(lastResetAt: Date): boolean {
  return getJSTMonthKey(lastResetAt) !== getJSTMonthKey(new Date());
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
 * 選考スケジュール取得の月次無料残り（ログインユーザーのみ。Guest は 0）。
 */
export async function getRemainingFreeFetches(
  userId: string | null,
  _guestId: string | null,
  plan: PlanType,
) {
  if (!userId || plan === "guest") {
    return 0;
  }
  return getRemainingMonthlyScheduleFreeFetchesSafe(userId, plan as PaidPlan);
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
