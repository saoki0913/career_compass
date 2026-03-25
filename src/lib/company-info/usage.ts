import { and, eq, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { companyInfoMonthlyUsage } from "@/lib/db/schema";
import {
  calculatePdfIngestCredits,
  getCurrentJstMonthKey,
  getMonthlyRagFreeUnits,
  getMonthlyScheduleFetchFreeLimit,
  type PaidPlan,
} from "@/lib/company-info/pricing";
import { consumeCredits } from "@/lib/credits";

/** Drizzle 等が外側に Failed query、内側の cause に Postgres 詳細を載せるため、チェーンをまとめて見る */
function getErrorDiagnosticText(error: unknown): string {
  const parts: string[] = [];
  let current: unknown = error;
  const visited = new Set<unknown>();

  for (let depth = 0; depth < 12 && current != null; depth += 1) {
    if (visited.has(current)) break;
    visited.add(current);

    if (current instanceof Error) {
      parts.push(current.message);
      const code = (current as { code?: string }).code;
      if (typeof code === "string" && code.length > 0) {
        parts.push(`code:${code}`);
      }
      current = current.cause;
      continue;
    }

    if (typeof current === "object" && current !== null && "message" in current) {
      parts.push(String((current as { message: unknown }).message));
    }
    break;
  }

  return parts.join("\n").toLowerCase();
}

export function isMissingMonthlyUsageTableError(error: unknown): boolean {
  const message = getErrorDiagnosticText(error);
  return (
    message.includes("company_info_monthly_usage") &&
    (message.includes("does not exist") ||
      message.includes("no such table") ||
      message.includes("relation") ||
      message.includes("sqlite_error"))
  );
}

export function isMissingMonthlyUsageScheduleColumnError(error: unknown): boolean {
  const message = getErrorDiagnosticText(error);
  const mentionsColumn = message.includes("schedule_fetch_free_uses");
  if (!mentionsColumn) return false;
  return (
    message.includes("does not exist") ||
    message.includes("no such column") ||
    message.includes("no such field") ||
    message.includes("unknown column") ||
    message.includes("code:42703")
  );
}

export function isMissingMonthlyUsageSchemaError(error: unknown): boolean {
  return isMissingMonthlyUsageTableError(error) || isMissingMonthlyUsageScheduleColumnError(error);
}

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

export async function getRemainingCompanyRagFreeUnitsSafe(
  userId: string,
  plan: PaidPlan,
): Promise<number> {
  try {
    return await getRemainingCompanyRagFreeUnits(userId, plan);
  } catch (error) {
    if (isMissingMonthlyUsageTableError(error)) {
      return getMonthlyRagFreeUnits(plan);
    }
    throw error;
  }
}

export async function getRemainingMonthlyScheduleFreeFetches(
  userId: string,
  plan: PaidPlan,
): Promise<number> {
  const limit = getMonthlyScheduleFetchFreeLimit(plan);
  if (limit <= 0) return 0;
  const monthKey = getCurrentJstMonthKey();
  const usage = await getOrCreateMonthlyUsage(userId, monthKey);
  const used = usage.scheduleFetchFreeUses ?? 0;
  return Math.max(0, limit - used);
}

export async function getRemainingMonthlyScheduleFreeFetchesSafe(
  userId: string,
  plan: PaidPlan,
): Promise<number> {
  try {
    return await getRemainingMonthlyScheduleFreeFetches(userId, plan);
  } catch (error) {
    if (isMissingMonthlyUsageSchemaError(error)) {
      return getMonthlyScheduleFetchFreeLimit(plan);
    }
    throw error;
  }
}

/** 選考スケジュール取得成功時のみ呼ぶ（月次無料枠 1 回消費） */
export async function incrementMonthlyScheduleFreeUse(userId: string): Promise<void> {
  try {
    const monthKey = getCurrentJstMonthKey();
    const usage = await getOrCreateMonthlyUsage(userId, monthKey);
    await db
      .update(companyInfoMonthlyUsage)
      .set({
        scheduleFetchFreeUses: sql`${companyInfoMonthlyUsage.scheduleFetchFreeUses} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(companyInfoMonthlyUsage.id, usage.id));
  } catch (error) {
    if (isMissingMonthlyUsageSchemaError(error)) {
      console.warn("Skipping monthly schedule free usage increment because monthly usage schema is not fully migrated.", error);
      return;
    }
    throw error;
  }
}

export type CompanyRagUsageKind = "url" | "pdf";

/**
 * 企業RAGの月次無料枠（ページ）とクレジット課金を適用する。
 * - URL: 無料残をページ数ぶん消費し、超過ページは 1 ページ = 1 クレジット。
 * - PDF: 無料残をページ数ぶん消費し、取込ごとにページ数帯の固定クレジットをフル課金。
 */
export async function applyCompanyRagUsage(params: {
  userId: string;
  plan: PaidPlan;
  pages: number;
  kind: CompanyRagUsageKind;
  referenceId?: string;
  description?: string;
}): Promise<{
  freeUnitsApplied: number;
  overflowUnits: number;
  creditsDisplayed: number;
  creditsActuallyDeducted: number;
  remainingFreeUnits: number;
}> {
  const pagesTotal = Math.max(0, Math.floor(params.pages));
  if (pagesTotal === 0) {
    return {
      freeUnitsApplied: 0,
      overflowUnits: 0,
      creditsDisplayed: 0,
      creditsActuallyDeducted: 0,
      remainingFreeUnits: await getRemainingCompanyRagFreeUnits(params.userId, params.plan),
    };
  }

  try {
    const monthKey = getCurrentJstMonthKey();
    const usage = await getOrCreateMonthlyUsage(params.userId, monthKey);
    const monthlyFreePages = getMonthlyRagFreeUnits(params.plan);
    const freePagesRemaining = Math.max(0, monthlyFreePages - usage.ragIngestUnits);
    const freeUnitsApplied = Math.min(freePagesRemaining, pagesTotal);
    const overflowUnits = pagesTotal - freeUnitsApplied;

    const creditsNeeded =
      params.kind === "url" ? overflowUnits : calculatePdfIngestCredits(pagesTotal);
    const creditsDisplayed = creditsNeeded;
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

    await db
      .update(companyInfoMonthlyUsage)
      .set({
        ragIngestUnits: usage.ragIngestUnits + freeUnitsApplied,
        ragOverflowUnits: 0,
        updatedAt: now,
      })
      .where(eq(companyInfoMonthlyUsage.id, usage.id));

    return {
      freeUnitsApplied,
      overflowUnits,
      creditsDisplayed,
      creditsActuallyDeducted,
      remainingFreeUnits: Math.max(0, freePagesRemaining - freeUnitsApplied),
    };
  } catch (error) {
    if (isMissingMonthlyUsageSchemaError(error)) {
      const monthlyFreePages = getMonthlyRagFreeUnits(params.plan);
      const freeUnitsApplied = Math.min(monthlyFreePages, pagesTotal);
      return {
        freeUnitsApplied,
        overflowUnits: pagesTotal - freeUnitsApplied,
        creditsDisplayed: 0,
        creditsActuallyDeducted: 0,
        remainingFreeUnits: Math.max(0, monthlyFreePages - pagesTotal),
      };
    }
    throw error;
  }
}
