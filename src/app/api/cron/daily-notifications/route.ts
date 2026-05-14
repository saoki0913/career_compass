/**
 * Daily Notifications Cron Job API
 *
 * GET: Triggered by Vercel Cron at JST 9:00 (UTC 0:00) daily
 * Executes deadline reminders, cleanup, and daily_summary (1/day; Vercel Hobby は毎時 Cron 不可のためここでまとめる)
 */

import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { getAppUrl } from "@/lib/app-url";
import { createApiErrorResponse } from "@/bff/api/error-response";
import { logError, logInfo, logWarn } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Constant-time token comparison to prevent timing attacks
 */
function verifyToken(provided: string | null, expected: string): boolean {
  if (!provided || !expected) return false;

  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(`Bearer ${expected}`);

  // Length must match for timingSafeEqual
  if (providedBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(providedBuffer, expectedBuffer);
}

export async function GET(request: NextRequest) {
  try {
    // Verify Vercel Cron authorization with timing-safe comparison
    const authHeader = request.headers.get("authorization");
    if (!verifyToken(authHeader, process.env.CRON_SECRET || "")) {
      logWarn("daily-notifications-cron-unauthorized", {
        route: "/api/cron/daily-notifications",
        status: 401,
      });
      return createApiErrorResponse(request, {
        status: 401,
        code: "CRON_AUTH_REQUIRED",
        userMessage: "認証に失敗しました。",
        action: "Cron secret の設定を確認してください。",
      });
    }

    const baseUrl = getAppUrl();

    // Execute batch processes in sequence
    const results: Record<string, unknown> = {};
    const batchJobs: { type: string; body?: Record<string, unknown> }[] = [
      { type: "deadline_reminders" },
      { type: "cleanup" },
      {
        type: "daily_summary",
        body: { type: "daily_summary", matchPreferredJstHour: false },
      },
    ];

    for (const job of batchJobs) {
      const type = job.type;
      try {
        const res = await fetch(`${baseUrl}/api/notifications/batch`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${process.env.CRON_SECRET}`,
          },
          body: JSON.stringify(job.body ?? { type }),
        });
        results[type] = await res.json();
      } catch (error) {
        logError("daily-notifications-batch-failed", error, {
          route: "/api/cron/daily-notifications",
          event: type,
        });
        results[type] = { error: "Failed to execute batch" };
      }
    }

    logInfo("daily-notifications-cron-completed", {
      route: "/api/cron/daily-notifications",
      count: batchJobs.length,
      event: "daily_notifications",
    });

    return NextResponse.json({
      success: true,
      executedAt: new Date().toISOString(),
      results,
    });
  } catch (error) {
    return createApiErrorResponse(request, {
      status: 500,
      code: "DAILY_NOTIFICATIONS_CRON_FAILED",
      userMessage: "通知処理に失敗しました。",
      action: "時間をおいて再実行してください。",
      error,
      logContext: "daily-notifications-cron-failed",
    });
  }
}
