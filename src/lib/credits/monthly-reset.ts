import { eq, sql } from "drizzle-orm";

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

export async function initializeCredits(userId: string, plan: PlanType = "free"): Promise<boolean> {
  const allocation = PLAN_CREDITS[plan];
  const now = new Date();

  return db.transaction(async (tx) => {
    const inserted = await tx
      .insert(credits)
      .values({
        id: crypto.randomUUID(),
        userId,
        balance: allocation,
        monthlyAllocation: allocation,
        lastResetAt: now,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing({ target: credits.userId })
      .returning({ balance: credits.balance });

    if (inserted.length === 0) {
      return false;
    }

    await tx.insert(creditTransactions).values({
      id: crypto.randomUUID(),
      userId,
      amount: allocation,
      type: "monthly_grant",
      description: "Initial credit allocation",
      balanceAfter: allocation,
      createdAt: now,
    });

    return true;
  });
}

export async function grantMonthlyCredits(userId: string) {
  const userCredits = await getCreditRow(userId);
  if (!userCredits) return;

  const now = new Date();
  const newBalance = userCredits.monthlyAllocation;

  await db.transaction(async (tx) => {
    await tx
      .update(credits)
      .set({
        balance: newBalance,
        lastResetAt: now,
        updatedAt: now,
      })
      .where(eq(credits.userId, userId));

    await tx.insert(creditTransactions).values({
      id: crypto.randomUUID(),
      userId,
      amount: newBalance - userCredits.balance,
      type: "monthly_grant",
      description: "Monthly credit reset",
      balanceAfter: newBalance,
      createdAt: now,
    });
  });
}

export async function updatePlanAllocation(userId: string, newPlan: PlanType) {
  const allocation = PLAN_CREDITS[newPlan];
  const now = new Date();
  const userCredits = await getCreditRow(userId);

  if (!userCredits) {
    const initialized = await initializeCredits(userId, newPlan);
    if (initialized) {
      return;
    }
  }

  await db.transaction(async (tx) => {
    const updatedRows = await tx.execute(sql`
      with locked as (
        select balance, monthly_allocation
        from credits
        where user_id = ${userId}
        for update
      ),
      updated as (
        update credits
        set
          balance = greatest(credits.balance + (${allocation} - locked.monthly_allocation), 0),
          monthly_allocation = ${allocation},
          last_reset_at = ${now},
          updated_at = ${now}
        from locked
        where credits.user_id = ${userId}
        returning locked.balance as previous_balance, credits.balance as balance
      )
      select previous_balance, balance from updated
    `);

    const [updatedCredits] = Array.from(updatedRows as Iterable<Record<string, unknown>>);
    if (!updatedCredits) {
      throw new Error(`Cannot update plan allocation without credits row: ${userId}`);
    }
    const previousBalance = Number(updatedCredits.previous_balance);
    const nextBalance = Number(updatedCredits.balance);
    if (!Number.isFinite(previousBalance) || !Number.isFinite(nextBalance)) {
      throw new Error(`Invalid plan allocation result: ${userId}`);
    }

    await tx.insert(creditTransactions).values({
      id: crypto.randomUUID(),
      userId,
      amount: nextBalance - previousBalance,
      type: "plan_change",
      description: `Plan changed to ${newPlan}`,
      balanceAfter: nextBalance,
      createdAt: now,
    });
  });
}
