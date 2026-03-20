import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { companyInfoMonthlyUsage } from "@/lib/db/schema";
import {
  COMPANY_RAG_UNITS_PER_CREDIT,
  getCurrentJstMonthKey,
  getMonthlyRagFreeUnits,
  type PaidPlan,
} from "@/lib/company-info/pricing";
import { consumeCredits } from "@/lib/credits";

async function getOrCreateMonthlyUsage(userId: string, monthKey: string) {
  const [existing] = await db
    .select()
    .from(companyInfoMonthlyUsage)
    .where(
      and(
        eq(companyInfoMonthlyUsage.userId, userId),
        eq(companyInfoMonthlyUsage.monthKey, monthKey),
      ),
    )
    .limit(1);

  if (existing) {
    return existing;
  }

  const now = new Date();
  const id = crypto.randomUUID();

  await db.insert(companyInfoMonthlyUsage).values({
    id,
    userId,
    monthKey,
    createdAt: now,
    updatedAt: now,
  });

  const [created] = await db
    .select()
    .from(companyInfoMonthlyUsage)
    .where(eq(companyInfoMonthlyUsage.id, id))
    .limit(1);

  if (!created) {
    throw new Error("Failed to initialize company info monthly usage");
  }

  return created;
}

export async function getRemainingCompanyRagFreeUnits(userId: string, plan: PaidPlan): Promise<number> {
  const monthKey = getCurrentJstMonthKey();
  const usage = await getOrCreateMonthlyUsage(userId, monthKey);
  return Math.max(0, getMonthlyRagFreeUnits(plan) - usage.ragIngestUnits);
}

export async function applyCompanyRagUsage(params: {
  userId: string;
  plan: PaidPlan;
  units: number;
  referenceId?: string;
  description?: string;
}): Promise<{
  freeUnitsApplied: number;
  overflowUnits: number;
  creditsDisplayed: number;
  creditsActuallyDeducted: number;
  remainingFreeUnits: number;
}> {
  const units = Math.max(0, Math.floor(params.units));
  if (units === 0) {
    return {
      freeUnitsApplied: 0,
      overflowUnits: 0,
      creditsDisplayed: 0,
      creditsActuallyDeducted: 0,
      remainingFreeUnits: await getRemainingCompanyRagFreeUnits(params.userId, params.plan),
    };
  }

  const monthKey = getCurrentJstMonthKey();
  const usage = await getOrCreateMonthlyUsage(params.userId, monthKey);
  const monthlyFreeUnits = getMonthlyRagFreeUnits(params.plan);
  const freeUnitsRemaining = Math.max(0, monthlyFreeUnits - usage.ragIngestUnits);
  const freeUnitsApplied = Math.min(freeUnitsRemaining, units);
  const overflowUnits = units - freeUnitsApplied;
  const nextOverflowUnits = usage.ragOverflowUnits + overflowUnits;
  const creditsDisplayed = Math.floor(nextOverflowUnits / COMPANY_RAG_UNITS_PER_CREDIT);
  let creditsActuallyDeducted = 0;

  if (creditsDisplayed > 0) {
    const consumption = await consumeCredits(
      params.userId,
      creditsDisplayed,
      "company_fetch",
      params.referenceId,
      params.description ?? "企業RAG取込",
    );
    if (!consumption.success) {
      throw new Error("Insufficient credits for company RAG usage");
    }
    creditsActuallyDeducted = creditsDisplayed;
  }

  const now = new Date();
  const remainderUnits = nextOverflowUnits % COMPANY_RAG_UNITS_PER_CREDIT;

  await db
    .update(companyInfoMonthlyUsage)
    .set({
      ragIngestUnits: usage.ragIngestUnits + freeUnitsApplied,
      ragOverflowUnits: remainderUnits,
      updatedAt: now,
    })
    .where(eq(companyInfoMonthlyUsage.id, usage.id));

  return {
    freeUnitsApplied,
    overflowUnits,
    creditsDisplayed,
    creditsActuallyDeducted,
    remainingFreeUnits: Math.max(0, freeUnitsRemaining - freeUnitsApplied),
  };
}
