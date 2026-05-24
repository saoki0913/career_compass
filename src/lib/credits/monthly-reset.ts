import { eq, sql } from "drizzle-orm";

import { creditTransactions, credits, db, PLAN_CREDITS, type PlanType } from "./shared";

type CreditsTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

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

export async function initializeCreditsTx(
  tx: CreditsTransaction,
  userId: string,
  plan: PlanType = "free",
): Promise<boolean> {
  const allocation = PLAN_CREDITS[plan];
  const now = new Date();

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
    status: "applied",
    idempotencyKey: `initial_grant:${userId}`,
    operationId: "initial_grant",
    balanceAfter: allocation,
    createdAt: now,
  });

  return true;
}

export async function initializeCredits(userId: string, plan: PlanType = "free"): Promise<boolean> {
  return db.transaction((tx) => initializeCreditsTx(tx, userId, plan));
}

export async function grantMonthlyCredits(userId: string) {
  const now = new Date();
  const monthKey = getJSTMonthKey(now);

  await db.transaction(async (tx) => {
    const updatedRows = await tx.execute(sql`
      with locked as (
        select balance, monthly_allocation, last_reset_at
        from credits
        where user_id = ${userId}
          and to_char(last_reset_at at time zone 'Asia/Tokyo', 'YYYY-MM') <> ${monthKey}
        for update
      ),
      updated as (
        update credits
        set
          balance = locked.monthly_allocation,
          last_reset_at = now(),
          updated_at = now()
        from locked
        where credits.user_id = ${userId}
        returning locked.balance as previous_balance, credits.balance as balance
      )
      select previous_balance, balance from updated
    `);

    const [updatedCredits] = Array.from(updatedRows as Iterable<Record<string, unknown>>);
    if (!updatedCredits) {
      return;
    }
    const previousBalance = Number(updatedCredits.previous_balance);
    const nextBalance = Number(updatedCredits.balance);
    if (!Number.isFinite(previousBalance) || !Number.isFinite(nextBalance)) {
      throw new Error(`Invalid monthly grant result: ${userId}`);
    }

    await tx.insert(creditTransactions).values({
      id: crypto.randomUUID(),
      userId,
      amount: nextBalance - previousBalance,
      type: "monthly_grant",
      description: "Monthly credit reset",
      status: "applied",
      idempotencyKey: `monthly_grant:${userId}:${monthKey}`,
      operationId: monthKey,
      balanceAfter: nextBalance,
      createdAt: now,
    });
  });
}

export async function updatePlanAllocation(userId: string, newPlan: PlanType) {
  return db.transaction((tx) => updatePlanAllocationCoreTx(tx, userId, newPlan));
}

export async function updatePlanAllocationIfCurrent(
  userId: string,
  newPlan: PlanType,
  expectedCurrentAllocation: number | null,
) {
  return db.transaction((tx) => (
    updatePlanAllocationCoreTx(tx, userId, newPlan, expectedCurrentAllocation)
  ));
}

export async function updatePlanAllocationCoreTx(
  tx: CreditsTransaction,
  userId: string,
  newPlan: PlanType,
  expectedCurrentAllocation: number | null = null,
) {
  const allocation = PLAN_CREDITS[newPlan];
  const now = new Date();
  const hasExpectedCurrentAllocation =
    typeof expectedCurrentAllocation === "number" &&
    Number.isInteger(expectedCurrentAllocation);
  const [userCredits] = await tx
    .select()
    .from(credits)
    .where(eq(credits.userId, userId))
    .limit(1);

  if (!userCredits) {
    const initialized = await initializeCreditsTx(tx, userId, newPlan);
    if (initialized) {
      return;
    }
  } else if (
    !hasExpectedCurrentAllocation
    && userCredits.monthlyAllocation === allocation
  ) {
    return;
  }

  const expectedAllocationGuard = hasExpectedCurrentAllocation
    ? sql`and locked.monthly_allocation = ${expectedCurrentAllocation}`
    : sql``;

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
        last_reset_at = now(),
        updated_at = now()
      from locked
      where credits.user_id = ${userId}
        ${expectedAllocationGuard}
      returning locked.balance as previous_balance, credits.balance as balance
    )
    select previous_balance, balance from updated
  `);

  const [updatedCredits] = Array.from(updatedRows as Iterable<Record<string, unknown>>);
  if (!updatedCredits) {
    if (hasExpectedCurrentAllocation) {
      return;
    }
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
    status: "applied",
    operationId: `plan_change:${newPlan}`,
    balanceAfter: nextBalance,
    createdAt: now,
  });
}
