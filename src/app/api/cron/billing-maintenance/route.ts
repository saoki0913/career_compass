import { timingSafeEqual } from "crypto";
import { and, eq, lt, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { processedStripeEvents } from "@/lib/db/schema";
import { cleanupExpiredReservations } from "@/lib/credits";
import { logError, logInfo, logWarn } from "@/lib/logger";
import { createApiErrorResponse } from "@/bff/api/error-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function verifyToken(provided: string | null, expected: string): boolean {
  if (!provided || !expected) return false;

  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(`Bearer ${expected}`);
  if (providedBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(providedBuffer, expectedBuffer);
}

const RESERVATION_TTL_MINUTES = 30;
const SUCCEEDED_EVENT_TTL_DAYS = 90;
const FAILED_EVENT_TTL_DAYS = 180;
const EVENT_CLEANUP_LIMIT = 1000;

async function cleanupStripeEvents(): Promise<{ succeededDeleted: number; failedDeleted: number }> {
  const succeededCutoff = new Date(Date.now() - SUCCEEDED_EVENT_TTL_DAYS * 24 * 60 * 60 * 1000);
  const failedCutoff = new Date(Date.now() - FAILED_EVENT_TTL_DAYS * 24 * 60 * 60 * 1000);

  const succeededRows = await db
    .delete(processedStripeEvents)
    .where(
      and(
        eq(processedStripeEvents.status, "succeeded"),
        lt(processedStripeEvents.processedAt, succeededCutoff),
        sql`ctid IN (SELECT ctid FROM ${processedStripeEvents} WHERE ${processedStripeEvents.status} = 'succeeded' AND ${processedStripeEvents.processedAt} < ${succeededCutoff} LIMIT ${EVENT_CLEANUP_LIMIT})`,
      ),
    )
    .returning({ eventId: processedStripeEvents.eventId });

  const failedRows = await db
    .delete(processedStripeEvents)
    .where(
      and(
        eq(processedStripeEvents.status, "failed"),
        lt(processedStripeEvents.processedAt, failedCutoff),
        sql`ctid IN (SELECT ctid FROM ${processedStripeEvents} WHERE ${processedStripeEvents.status} = 'failed' AND ${processedStripeEvents.processedAt} < ${failedCutoff} LIMIT 500)`,
      ),
    )
    .returning({ eventId: processedStripeEvents.eventId });

  return {
    succeededDeleted: succeededRows.length,
    failedDeleted: failedRows.length,
  };
}

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    if (!verifyToken(authHeader, process.env.CRON_SECRET || "")) {
      return createApiErrorResponse(request, {
        status: 401,
        code: "BILLING_MAINTENANCE_UNAUTHORIZED",
        userMessage: "認証に失敗しました。",
        developerMessage: "Invalid billing maintenance cron secret",
      });
    }

    const reservationResult = await cleanupExpiredReservations(RESERVATION_TTL_MINUTES);
    const eventResult = await cleanupStripeEvents();

    // Phase 8 observability: orphan reservations are the symptom of an
    // atomic persist+confirmInTx leak (the rare reserve-then-crash window).
    // The atomic tx pattern from Phase 3-5 should drive this to zero, so any
    // non-zero count deserves a structured warning that surfaces in Vercel
    // logs separately from the JSON response body.
    if (reservationResult.canceledCount > 0) {
      logWarn("billing-maintenance.orphan-reservations", {
        canceledCount: reservationResult.canceledCount,
        totalRefunded: reservationResult.totalRefunded,
        errorCount: reservationResult.errors.length,
      });
    }
    logInfo("billing-maintenance.completed", {
      canceledCount: reservationResult.canceledCount,
      totalRefunded: reservationResult.totalRefunded,
      stripeSucceededDeleted: eventResult.succeededDeleted,
      stripeFailedDeleted: eventResult.failedDeleted,
    });

    return NextResponse.json({
      success: true,
      executedAt: new Date().toISOString(),
      reservations: {
        canceledCount: reservationResult.canceledCount,
        totalRefunded: reservationResult.totalRefunded,
        errors: reservationResult.errors,
      },
      stripeEvents: {
        succeededDeleted: eventResult.succeededDeleted,
        failedDeleted: eventResult.failedDeleted,
      },
    });
  } catch (error) {
    logError("billing-maintenance-cron", error);
    return createApiErrorResponse(request, {
      status: 500,
      code: "BILLING_MAINTENANCE_FAILED",
      userMessage: "請求メンテナンスを実行できませんでした。",
      developerMessage: "Billing maintenance cron failed",
      error,
    });
  }
}
