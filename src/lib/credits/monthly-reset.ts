import { eq } from "drizzle-orm";

import { creditTransactions, credits, db, getCreditRow, PLAN_CREDITS, type PlanType } from "./shared";

export function getJSTDateString(): string {
  const jst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return jst.toISOString().split("T")[0];
}

export function getJSTMonthKey(date: Date = new Date()): string {
  const jst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  return jst.toISOString().slice(0, 7);
}

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
    0,
  );
  return new Date(nextMonthStartUtc - jstOffsetMs);
}

export function shouldGrantMonthlyCredits(lastResetAt: Date): boolean {
  return getJSTMonthKey(lastResetAt) !== getJSTMonthKey(new Date());
}

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

export async function grantMonthlyCredits(userId: string) {
  const userCredits = await getCreditRow(userId);
  if (!userCredits) return;

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

export async function updatePlanAllocation(userId: string, newPlan: PlanType) {
  const allocation = PLAN_CREDITS[newPlan];
  const now = new Date();
  const userCredits = await getCreditRow(userId);

  if (!userCredits) {
    await initializeCredits(userId, newPlan);
    return;
  }

  await db
    .update(credits)
    .set({
      balance: allocation,
      monthlyAllocation: allocation,
      lastResetAt: now,
      updatedAt: now,
    })
    .where(eq(credits.userId, userId));

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
