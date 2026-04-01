/**
 * Notification Settings API
 *
 * GET: Get user notification settings
 * PUT: Update user notification settings
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { notificationSettings } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { DAILY_SUMMARY_HOURS_JST, isDailySummaryHourJst } from "@/lib/datetime/jst";
import { createApiErrorResponse } from "@/app/api/_shared/error-response";
import { logError } from "@/lib/logger";

export async function GET(request: NextRequest) {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user?.id) {
      return createApiErrorResponse(request, {
        status: 401,
        code: "AUTH_REQUIRED",
        userMessage: "ログイン状態を確認して、もう一度お試しください。",
        developerMessage: "Authentication required",
      });
    }

    const userId = session.user.id;

    // Get or create notification settings
    let settings = (await db
      .select()
      .from(notificationSettings)
      .where(eq(notificationSettings.userId, userId))
      .limit(1))[0];

    // If settings don't exist, create default settings
    if (!settings) {
      const newSettings = await db
        .insert(notificationSettings)
        .values({
          id: crypto.randomUUID(),
          userId,
          deadlineReminder: true,
          deadlineNear: true,
          companyFetch: true,
          esReview: true,
          dailySummary: true,
          reminderTiming: JSON.stringify([
            { type: "day_before" },
            { type: "hour_before", hours: 3 },
          ]),
          dailySummaryHourJst: 9,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();

      settings = newSettings[0];
    }

    return NextResponse.json({
      settings: {
        deadlineReminder: settings.deadlineReminder,
        deadlineNear: settings.deadlineNear,
        companyFetch: settings.companyFetch,
        esReview: settings.esReview,
        dailySummary: settings.dailySummary,
        reminderTiming: settings.reminderTiming
          ? JSON.parse(settings.reminderTiming)
          : [{ type: "day_before" }, { type: "hour_before", hours: 3 }],
        dailySummaryHourJst: settings.dailySummaryHourJst ?? 9,
      },
    });
  } catch (error) {
    logError("fetch-notification-settings", error);
    return createApiErrorResponse(request, {
      status: 500,
      code: "SETTINGS_NOTIFICATIONS_FETCH_FAILED",
      userMessage: "通知設定を読み込めませんでした。",
      action: "時間をおいて、もう一度お試しください。",
      developerMessage: "Failed to fetch notification settings",
      error,
    });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user?.id) {
      return createApiErrorResponse(request, {
        status: 401,
        code: "AUTH_REQUIRED",
        userMessage: "ログイン状態を確認して、もう一度お試しください。",
        developerMessage: "Authentication required",
      });
    }

    const userId = session.user.id;
    const body = await request.json();
    const {
      deadlineReminder,
      deadlineNear,
      companyFetch,
      esReview,
      dailySummary,
      dailySummaryHourJst,
      reminderTiming,
    } = body;

    // Check if settings exist
    const [existingSettings] = await db
      .select()
      .from(notificationSettings)
      .where(eq(notificationSettings.userId, userId))
      .limit(1);

    const settingsData: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    if (deadlineReminder !== undefined) {
      settingsData.deadlineReminder = Boolean(deadlineReminder);
    }
    if (deadlineNear !== undefined) {
      settingsData.deadlineNear = Boolean(deadlineNear);
    }
    if (companyFetch !== undefined) {
      settingsData.companyFetch = Boolean(companyFetch);
    }
    if (esReview !== undefined) {
      settingsData.esReview = Boolean(esReview);
    }
    if (dailySummary !== undefined) {
      settingsData.dailySummary = Boolean(dailySummary);
    }
    if (dailySummaryHourJst !== undefined) {
      const h = Number(dailySummaryHourJst);
      if (!isDailySummaryHourJst(h)) {
        return createApiErrorResponse(request, {
          status: 400,
          code: "SETTINGS_NOTIFICATIONS_INVALID_DAILY_SUMMARY_HOUR",
          userMessage: "デイリーサマリーの時刻を確認してください。",
          action: `${DAILY_SUMMARY_HOURS_JST.join(" / ")} 時（JST）から選択してください。`,
          developerMessage: "Invalid daily summary hour",
        });
      }
      settingsData.dailySummaryHourJst = h;
    }
    if (reminderTiming !== undefined) {
      if (!Array.isArray(reminderTiming)) {
        return createApiErrorResponse(request, {
          status: 400,
          code: "SETTINGS_NOTIFICATIONS_INVALID_REMINDER_TIMING",
          userMessage: "通知設定の内容を確認してください。",
          developerMessage: "Reminder timing payload is invalid",
        });
      }
      settingsData.reminderTiming = JSON.stringify(reminderTiming);
    }

    if (existingSettings) {
      await db
        .update(notificationSettings)
        .set(settingsData)
        .where(eq(notificationSettings.userId, userId));
    } else {
      await db.insert(notificationSettings).values({
        id: crypto.randomUUID(),
        userId,
        deadlineReminder: Boolean(deadlineReminder ?? true),
        deadlineNear: Boolean(deadlineNear ?? true),
        companyFetch: Boolean(companyFetch ?? true),
        esReview: Boolean(esReview ?? true),
        dailySummary: Boolean(dailySummary ?? true),
        reminderTiming: reminderTiming
          ? JSON.stringify(reminderTiming)
          : JSON.stringify([
              { type: "day_before" },
              { type: "hour_before", hours: 3 },
            ]),
        dailySummaryHourJst:
          dailySummaryHourJst !== undefined && isDailySummaryHourJst(Number(dailySummaryHourJst))
            ? Number(dailySummaryHourJst)
            : 9,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }

    // Get updated settings
    const [updated] = await db
      .select()
      .from(notificationSettings)
      .where(eq(notificationSettings.userId, userId))
      .limit(1);

    return NextResponse.json({
      settings: {
        deadlineReminder: updated?.deadlineReminder,
        deadlineNear: updated?.deadlineNear,
        companyFetch: updated?.companyFetch,
        esReview: updated?.esReview,
        dailySummary: updated?.dailySummary,
        reminderTiming: updated?.reminderTiming
          ? JSON.parse(updated.reminderTiming)
          : [{ type: "day_before" }, { type: "hour_before", hours: 3 }],
        dailySummaryHourJst: updated?.dailySummaryHourJst ?? 9,
      },
    });
  } catch (error) {
    logError("update-notification-settings", error);
    return createApiErrorResponse(request, {
      status: 500,
      code: "SETTINGS_NOTIFICATIONS_UPDATE_FAILED",
      userMessage: "通知設定を保存できませんでした。",
      action: "時間をおいて、もう一度お試しください。",
      developerMessage: "Failed to update notification settings",
      error,
    });
  }
}
