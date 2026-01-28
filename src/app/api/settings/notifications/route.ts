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

export async function GET(request: NextRequest) {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    const userId = session.user.id;

    // Get or create notification settings
    let settings = await db
      .select()
      .from(notificationSettings)
      .where(eq(notificationSettings.userId, userId))
      .get();

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
      },
    });
  } catch (error) {
    console.error("Error fetching notification settings:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    const userId = session.user.id;
    const body = await request.json();
    const {
      deadlineReminder,
      deadlineNear,
      companyFetch,
      esReview,
      dailySummary,
      reminderTiming,
    } = body;

    // Check if settings exist
    const existingSettings = await db
      .select()
      .from(notificationSettings)
      .where(eq(notificationSettings.userId, userId))
      .get();

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
    if (reminderTiming !== undefined) {
      if (!Array.isArray(reminderTiming)) {
        return NextResponse.json(
          { error: "リマインダー設定の形式が無効です" },
          { status: 400 }
        );
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
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }

    // Get updated settings
    const updated = await db
      .select()
      .from(notificationSettings)
      .where(eq(notificationSettings.userId, userId))
      .get();

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
      },
    });
  } catch (error) {
    console.error("Error updating notification settings:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
