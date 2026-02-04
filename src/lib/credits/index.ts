/**
 * Credits Management Library
 *
 * Handles credit balance, transactions, and daily free usage tracking.
 * Important: Credits are only consumed on successful operations.
 */

import { db } from "@/lib/db";
import { credits, creditTransactions, dailyFreeUsage, userProfiles } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
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
export type TransactionType = "monthly_grant" | "plan_change" | "company_fetch" | "es_review" | "gakuchika" | "motivation" | "motivation_draft" | "refund";

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
  const userCredits = await db
    .select()
    .from(credits)
    .where(eq(credits.userId, userId))
    .get();

  if (!userCredits) {
    // Get user's plan and initialize credits
    const profile = await db
      .select()
      .from(userProfiles)
      .where(eq(userProfiles.userId, userId))
      .get();

    const plan = (profile?.plan || "free") as PlanType;
    await initializeCredits(userId, plan);

    // Fetch the newly created credits
    const newCredits = await db
      .select()
      .from(credits)
      .where(eq(credits.userId, userId))
      .get();

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
    const updatedCredits = await db
      .select()
      .from(credits)
      .where(eq(credits.userId, userId))
      .get();

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
  const userCredits = await db
    .select()
    .from(credits)
    .where(eq(credits.userId, userId))
    .get();

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

  const userCredits = await db
    .select()
    .from(credits)
    .where(eq(credits.userId, userId))
    .get();

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
 * Returns false if insufficient credits
 */
export async function consumeCredits(
  userId: string,
  amount: number,
  type: TransactionType,
  referenceId?: string,
  description?: string
): Promise<{ success: boolean; newBalance: number; error?: string }> {
  const userCredits = await db
    .select()
    .from(credits)
    .where(eq(credits.userId, userId))
    .get();

  if (!userCredits) {
    return { success: false, newBalance: 0, error: "Credits not initialized" };
  }

  if (userCredits.balance < amount) {
    return {
      success: false,
      newBalance: userCredits.balance,
      error: `Insufficient credits. Need ${amount}, have ${userCredits.balance}`,
    };
  }

  const newBalance = userCredits.balance - amount;
  const now = new Date();

  await db
    .update(credits)
    .set({
      balance: newBalance,
      updatedAt: now,
    })
    .where(eq(credits.userId, userId));

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

  const usage = await db
    .select()
    .from(dailyFreeUsage)
    .where(whereClause)
    .get();

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

  const existing = await db
    .select()
    .from(dailyFreeUsage)
    .where(whereClause)
    .get();

  if (existing) {
    await db
      .update(dailyFreeUsage)
      .set({
        [field]: existing[field] + 1,
      })
      .where(eq(dailyFreeUsage.id, existing.id));
  } else {
    await db.insert(dailyFreeUsage).values({
      id: crypto.randomUUID(),
      userId: userId || null,
      guestId: guestId || null,
      date: today,
      [field]: 1,
      createdAt: new Date(),
    });
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
 * Use case: When deadline extraction fails but other items are extracted
 */
export async function consumePartialCredits(
  userId: string,
  type: TransactionType,
  referenceId?: string,
  description?: string
): Promise<{ success: boolean; newBalance: number; actualConsumed: number }> {
  const userCredits = await db.select().from(credits).where(eq(credits.userId, userId)).get();
  if (!userCredits) return { success: false, newBalance: 0, actualConsumed: 0 };

  const now = new Date();
  const newAccumulator = (userCredits.partialCreditAccumulator || 0) + 1;

  if (newAccumulator >= 2) {
    // Deduct 1 credit
    if (userCredits.balance < 1) {
      return { success: false, newBalance: userCredits.balance, actualConsumed: 0 };
    }
    const newBalance = userCredits.balance - 1;
    await db.update(credits).set({
      balance: newBalance,
      partialCreditAccumulator: 0,
      updatedAt: now,
    }).where(eq(credits.userId, userId));

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
  } else {
    // Just accumulate
    await db.update(credits).set({
      partialCreditAccumulator: newAccumulator,
      updatedAt: now,
    }).where(eq(credits.userId, userId));
    return { success: true, newBalance: userCredits.balance, actualConsumed: 0 };
  }
}
