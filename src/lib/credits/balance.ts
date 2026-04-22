import type { PaidPlan } from "@/lib/company-info/pricing";
import { getRemainingMonthlyScheduleFreeFetchesSafe } from "@/lib/company-info/usage";

import { getUserPlan, type PlanType } from "./shared";
import {
  getNextResetDate,
  grantMonthlyCredits,
  initializeCredits,
  shouldGrantMonthlyCredits,
} from "./monthly-reset";
import { getCreditRow } from "./shared";

export async function getCreditsInfo(userId: string) {
  const userCredits = await getCreditRow(userId);

  if (!userCredits) {
    const plan = await getUserPlan(userId);
    await initializeCredits(userId, plan);

    const newCredits = await getCreditRow(userId);
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

  if (shouldGrantMonthlyCredits(userCredits.lastResetAt)) {
    await grantMonthlyCredits(userId);
    const updatedCredits = await getCreditRow(userId);

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

export async function getRemainingFreeFetches(userId: string | null, _guestId: string | null, plan: PlanType) {
  if (!userId || plan === "guest") {
    return 0;
  }
  return getRemainingMonthlyScheduleFreeFetchesSafe(userId, plan as PaidPlan);
}

export async function hasEnoughCredits(userId: string, amount: number): Promise<boolean> {
  const info = await getCreditsInfo(userId);
  return info.balance >= amount;
}
