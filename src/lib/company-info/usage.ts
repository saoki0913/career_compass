import { and, eq, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { companyInfoMonthlyUsage } from "@/lib/db/schema";
import {
  calculatePdfIngestCredits,
  getCurrentJstMonthKey,
  getMonthlyRagHtmlFreeUnits,
  getMonthlyRagPdfFreeUnits,
  getMonthlyScheduleFetchFreeLimit,
  type PaidPlan,
} from "@/lib/company-info/pricing";
import { cancelReservation, confirmReservation, reserveCredits } from "@/lib/credits";

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

export function isMissingMonthlyUsageRagSplitColumnError(error: unknown): boolean {
  const message = getErrorDiagnosticText(error);
  const mentionsColumn =
    message.includes("rag_html_free_units") || message.includes("rag_pdf_free_units");
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
  return (
    isMissingMonthlyUsageTableError(error) ||
    isMissingMonthlyUsageScheduleColumnError(error) ||
    isMissingMonthlyUsageRagSplitColumnError(error)
  );
}

// race-safe: INSERT … onConflictDoNothing + re-SELECT handles concurrent creation.
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
  }).onConflictDoNothing({
    target: [companyInfoMonthlyUsage.userId, companyInfoMonthlyUsage.monthKey],
  });

  const [createdOrExisting] = await db
    .select()
    .from(companyInfoMonthlyUsage)
    .where(
      and(
        eq(companyInfoMonthlyUsage.userId, userId),
        eq(companyInfoMonthlyUsage.monthKey, monthKey),
      ),
    )
    .limit(1);

  if (!createdOrExisting) {
    throw new Error("Failed to initialize company info monthly usage");
  }

  return createdOrExisting;
}

function shouldFailClosedOnMissingMonthlyUsageSchema(): boolean {
  return (
    process.env.NODE_ENV === "production" ||
    process.env.VERCEL_ENV === "production" ||
    process.env.VERCEL_ENV === "preview" ||
    process.env.RAILWAY_ENVIRONMENT_NAME === "production" ||
    process.env.RAILWAY_ENVIRONMENT_NAME === "staging"
  );
}

function handleMissingMonthlyUsageSchemaFallback<T>(error: unknown, fallback: () => T): T {
  if (!isMissingMonthlyUsageSchemaError(error)) {
    throw error;
  }
  if (shouldFailClosedOnMissingMonthlyUsageSchema()) {
    throw error;
  }
  return fallback();
}

function readFreeUnitLockRow(rows: Iterable<Record<string, unknown>>): {
  previousFreeUnits: number;
  nextFreeUnits: number;
} | null {
  const [row] = Array.from(rows);
  if (!row) return null;
  const previous = Number(row.previous_free_units);
  const next = Number(row.next_free_units);
  if (!Number.isFinite(previous) || !Number.isFinite(next)) {
    throw new Error("Invalid company info usage lock result");
  }
  return {
    previousFreeUnits: previous,
    nextFreeUnits: next,
  };
}

/**
 * @deprecated URL/PDF 分離前の互換 API。新実装は HTML/PDF 別 getter を使う。
 */
export async function getRemainingCompanyRagFreeUnits(userId: string, plan: PaidPlan): Promise<number> {
  return getRemainingCompanyRagHtmlFreeUnits(userId, plan);
}

export async function getRemainingCompanyRagHtmlFreeUnits(userId: string, plan: PaidPlan): Promise<number> {
  const monthKey = getCurrentJstMonthKey();
  const usage = await getOrCreateMonthlyUsage(userId, monthKey);
  const used = usage.ragHtmlFreeUnits ?? 0;
  return Math.max(0, getMonthlyRagHtmlFreeUnits(plan) - used);
}

export async function getRemainingCompanyRagPdfFreeUnits(userId: string, plan: PaidPlan): Promise<number> {
  const monthKey = getCurrentJstMonthKey();
  const usage = await getOrCreateMonthlyUsage(userId, monthKey);
  const used = usage.ragPdfFreeUnits ?? 0;
  return Math.max(0, getMonthlyRagPdfFreeUnits(plan) - used);
}

export async function getRemainingCompanyRagFreeUnitsSafe(
  userId: string,
  plan: PaidPlan,
): Promise<number> {
  try {
    return await getRemainingCompanyRagHtmlFreeUnits(userId, plan);
  } catch (error) {
    return handleMissingMonthlyUsageSchemaFallback(error, () => getMonthlyRagHtmlFreeUnits(plan));
  }
}

export async function getRemainingCompanyRagHtmlFreeUnitsSafe(
  userId: string,
  plan: PaidPlan,
): Promise<number> {
  try {
    return await getRemainingCompanyRagHtmlFreeUnits(userId, plan);
  } catch (error) {
    return handleMissingMonthlyUsageSchemaFallback(error, () => getMonthlyRagHtmlFreeUnits(plan));
  }
}

export async function getRemainingCompanyRagPdfFreeUnitsSafe(
  userId: string,
  plan: PaidPlan,
): Promise<number> {
  try {
    return await getRemainingCompanyRagPdfFreeUnits(userId, plan);
  } catch (error) {
    return handleMissingMonthlyUsageSchemaFallback(error, () => getMonthlyRagPdfFreeUnits(plan));
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
    return handleMissingMonthlyUsageSchemaFallback(error, () => getMonthlyScheduleFetchFreeLimit(plan));
  }
}

/** 選考スケジュール取得開始時に月次無料枠 1 回分を予約する */
export async function reserveMonthlyScheduleFreeUse(userId: string, plan: PaidPlan): Promise<boolean> {
  const limit = getMonthlyScheduleFetchFreeLimit(plan);
  if (limit <= 0) return false;

  try {
    const monthKey = getCurrentJstMonthKey();
    const usage = await getOrCreateMonthlyUsage(userId, monthKey);
    const updated = await db
      .update(companyInfoMonthlyUsage)
      .set({
        scheduleFetchFreeUses: sql`${companyInfoMonthlyUsage.scheduleFetchFreeUses} + 1`,
        updatedAt: new Date(),
      })
      .where(and(
        eq(companyInfoMonthlyUsage.id, usage.id),
        sql`${companyInfoMonthlyUsage.scheduleFetchFreeUses} < ${limit}`,
      ))
      .returning({ id: companyInfoMonthlyUsage.id });
    return updated.length > 0;
  } catch (error) {
    return handleMissingMonthlyUsageSchemaFallback(error, () => false);
  }
}

/** 予約した月次無料枠を失敗時に戻す */
export async function cancelMonthlyScheduleFreeUse(userId: string): Promise<void> {
  try {
    const monthKey = getCurrentJstMonthKey();
    const usage = await getOrCreateMonthlyUsage(userId, monthKey);
    await db
      .update(companyInfoMonthlyUsage)
      .set({
        scheduleFetchFreeUses: sql`greatest(${companyInfoMonthlyUsage.scheduleFetchFreeUses} - 1, 0)`,
        updatedAt: new Date(),
      })
      .where(eq(companyInfoMonthlyUsage.id, usage.id));
  } catch (error) {
    if (!isMissingMonthlyUsageSchemaError(error) || shouldFailClosedOnMissingMonthlyUsageSchema()) {
      throw error;
    }
  }
}

/** @deprecated Use reserveMonthlyScheduleFreeUse at start and cancel on failure. */
export async function incrementMonthlyScheduleFreeUse(userId: string): Promise<void> {
  await reserveMonthlyScheduleFreeUse(userId, "free");
}

export type CompanyRagUsageKind = "url" | "pdf";

export type CompanyRagUsageReservation = {
  usageId: string | null;
  reservationId: string | null;
  kind: CompanyRagUsageKind;
  freeUnitsApplied: number;
  overflowUnits: number;
  creditsDisplayed: number;
  creditsActuallyDeducted: number;
  remainingFreeUnits: number;
};

/**
 * 企業RAGの月次無料枠（ページ）とクレジット課金を適用する。
 * - URL: URL/HTML 専用無料枠を消費し、超過ページは 1 ページ = 1 クレジット。
 * - PDF: PDF 専用無料枠を消費し、超過ページ数だけ軽量 tier credits を課金する。
 */
export async function reserveCompanyRagUsage(params: {
  userId: string;
  plan: PaidPlan;
  pages: number;
  kind: CompanyRagUsageKind;
  referenceId?: string;
  description?: string;
}): Promise<CompanyRagUsageReservation> {
  const pagesTotal = Math.max(0, Math.floor(params.pages));
  const remainingGetter =
    params.kind === "pdf" ? getRemainingCompanyRagPdfFreeUnits : getRemainingCompanyRagHtmlFreeUnits;
  if (pagesTotal === 0) {
    return {
      freeUnitsApplied: 0,
      overflowUnits: 0,
      creditsDisplayed: 0,
      creditsActuallyDeducted: 0,
      remainingFreeUnits: await remainingGetter(params.userId, params.plan),
      usageId: null,
      reservationId: null,
      kind: params.kind,
    };
  }

  try {
    const monthKey = getCurrentJstMonthKey();
    const monthlyFreePages =
      params.kind === "pdf" ? getMonthlyRagPdfFreeUnits(params.plan) : getMonthlyRagHtmlFreeUnits(params.plan);
    const usage = await getOrCreateMonthlyUsage(params.userId, monthKey);
    const lockedRows = params.kind === "pdf" ? await db.execute(sql`
      with locked as (
        select id,
               rag_pdf_free_units
        from company_info_monthly_usage
        where id = ${usage.id}
        for update
      ),
      updated as (
        update company_info_monthly_usage as usage
        set
          rag_ingest_units = usage.rag_ingest_units + least(greatest(${monthlyFreePages} - locked.rag_pdf_free_units, 0), ${pagesTotal}),
          rag_pdf_free_units = usage.rag_pdf_free_units + least(greatest(${monthlyFreePages} - locked.rag_pdf_free_units, 0), ${pagesTotal}),
          rag_overflow_units = 0,
          updated_at = now()
        from locked
        where usage.id = locked.id
        returning
          locked.rag_pdf_free_units as previous_free_units,
          usage.rag_pdf_free_units as next_free_units
      )
      select previous_free_units, next_free_units from updated
    `) : await db.execute(sql`
      with locked as (
        select id,
               rag_html_free_units
        from company_info_monthly_usage
        where id = ${usage.id}
        for update
      ),
      updated as (
        update company_info_monthly_usage as usage
        set
          rag_ingest_units = usage.rag_ingest_units + least(greatest(${monthlyFreePages} - locked.rag_html_free_units, 0), ${pagesTotal}),
          rag_html_free_units = usage.rag_html_free_units + least(greatest(${monthlyFreePages} - locked.rag_html_free_units, 0), ${pagesTotal}),
          rag_overflow_units = 0,
          updated_at = now()
        from locked
        where usage.id = locked.id
        returning
          locked.rag_html_free_units as previous_free_units,
          usage.rag_html_free_units as next_free_units
      )
      select previous_free_units, next_free_units from updated
    `);
    const lockedRow = readFreeUnitLockRow(lockedRows);
    if (!lockedRow) {
      throw new Error("Failed to lock company info monthly usage");
    }

    const freeUnitsApplied = Math.max(0, lockedRow.nextFreeUnits - lockedRow.previousFreeUnits);
    const freePagesRemaining = Math.max(0, monthlyFreePages - lockedRow.previousFreeUnits);
    const overflowUnits = pagesTotal - freeUnitsApplied;
    const creditsDisplayed = params.kind === "url" ? overflowUnits : calculatePdfIngestCredits(overflowUnits);
    let creditsActuallyDeducted = 0;
    let reservationId: string | null = null;

    if (creditsDisplayed > 0) {
      const reservation = await reserveCredits(
        params.userId,
        creditsDisplayed,
        "company_fetch",
        params.referenceId,
        params.description ?? "企業RAG取込",
      );
      if (!reservation.success) {
        const rollbackFreeUnits = params.kind === "url"
          ? {
              ragIngestUnits: sql`greatest(${companyInfoMonthlyUsage.ragIngestUnits} - ${freeUnitsApplied}, 0)`,
              ragHtmlFreeUnits: sql`greatest(${companyInfoMonthlyUsage.ragHtmlFreeUnits} - ${freeUnitsApplied}, 0)`,
              updatedAt: new Date(),
            }
          : {
              ragIngestUnits: sql`greatest(${companyInfoMonthlyUsage.ragIngestUnits} - ${freeUnitsApplied}, 0)`,
              ragPdfFreeUnits: sql`greatest(${companyInfoMonthlyUsage.ragPdfFreeUnits} - ${freeUnitsApplied}, 0)`,
              updatedAt: new Date(),
            };
        await db
          .update(companyInfoMonthlyUsage)
          .set(rollbackFreeUnits)
          .where(eq(companyInfoMonthlyUsage.id, usage.id));
        throw new Error("Insufficient credits for company RAG usage");
      }
      reservationId = reservation.reservationId;
      creditsActuallyDeducted = creditsDisplayed;
    }

    return {
      freeUnitsApplied,
      overflowUnits,
      creditsDisplayed,
      creditsActuallyDeducted,
      remainingFreeUnits: Math.max(0, freePagesRemaining - freeUnitsApplied),
      usageId: usage.id,
      reservationId,
      kind: params.kind,
    };
  } catch (error) {
    return handleMissingMonthlyUsageSchemaFallback(error, () => {
      const monthlyFreePages =
        params.kind === "pdf" ? getMonthlyRagPdfFreeUnits(params.plan) : getMonthlyRagHtmlFreeUnits(params.plan);
      const freeUnitsApplied = Math.min(monthlyFreePages, pagesTotal);
      const overflowUnits = pagesTotal - freeUnitsApplied;
      const creditsDisplayed = params.kind === "url" ? overflowUnits : calculatePdfIngestCredits(overflowUnits);
      return {
        freeUnitsApplied,
        overflowUnits,
        creditsDisplayed,
        creditsActuallyDeducted: 0,
        remainingFreeUnits: Math.max(0, monthlyFreePages - pagesTotal),
        usageId: null,
        reservationId: null,
        kind: params.kind,
      };
    });
  }
}

export async function confirmCompanyRagUsage(reservation: CompanyRagUsageReservation): Promise<void> {
  if (reservation.reservationId) {
    await confirmReservation(reservation.reservationId);
  }
}

export async function cancelCompanyRagUsage(reservation: CompanyRagUsageReservation): Promise<void> {
  if (reservation.usageId && reservation.freeUnitsApplied > 0) {
    const rollbackFreeUnits = reservation.kind === "url"
      ? {
          ragIngestUnits: sql`greatest(${companyInfoMonthlyUsage.ragIngestUnits} - ${reservation.freeUnitsApplied}, 0)`,
          ragHtmlFreeUnits: sql`greatest(${companyInfoMonthlyUsage.ragHtmlFreeUnits} - ${reservation.freeUnitsApplied}, 0)`,
          updatedAt: new Date(),
        }
      : {
          ragIngestUnits: sql`greatest(${companyInfoMonthlyUsage.ragIngestUnits} - ${reservation.freeUnitsApplied}, 0)`,
          ragPdfFreeUnits: sql`greatest(${companyInfoMonthlyUsage.ragPdfFreeUnits} - ${reservation.freeUnitsApplied}, 0)`,
          updatedAt: new Date(),
        };
    await db
      .update(companyInfoMonthlyUsage)
      .set(rollbackFreeUnits)
      .where(eq(companyInfoMonthlyUsage.id, reservation.usageId));
  }
  if (reservation.reservationId) {
    await cancelReservation(reservation.reservationId);
  }
}

/**
 * 企業RAGの月次無料枠（ページ）とクレジット課金を適用する。
 * - URL: URL/HTML 専用無料枠を消費し、超過ページは 1 ページ = 1 クレジット。
 * - PDF: PDF 専用無料枠を消費し、超過ページ数だけ軽量 tier credits を課金する。
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
  const reservation = await reserveCompanyRagUsage(params);
  await confirmCompanyRagUsage(reservation);
  return {
    freeUnitsApplied: reservation.freeUnitsApplied,
    overflowUnits: reservation.overflowUnits,
    creditsDisplayed: reservation.creditsDisplayed,
    creditsActuallyDeducted: reservation.creditsActuallyDeducted,
    remainingFreeUnits: reservation.remainingFreeUnits,
  };
}
