/**
 * Notification Batch Processing API
 *
 * POST: Trigger batch notifications (deadline reminders, cleanup, daily_summary)
 * Called by cron job only - requires CRON_SECRET authorization
 */
import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { db } from "@/lib/db";
import { notifications, deadlines, companies, userProfiles, notificationSettings } from "@/lib/db/schema";
import { eq, and, lte, gte, gt, isNull, count, inArray, or } from "drizzle-orm";
import { getJstHour, startOfJstDayAsUtc } from "@/lib/datetime/jst";
import { classifyTier, getEffectiveTiers, TIER_MESSAGES, type ReminderTier } from "@/lib/notifications/deadline-importance";

type NotificationInsertRow = typeof notifications.$inferInsert;

/**
 * Constant-time token comparison to prevent timing attacks
 */
function verifyToken(provided: string | null, expected: string): boolean {
  if (!provided || !expected) return false;

  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(`Bearer ${expected}`);

  if (providedBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(providedBuffer, expectedBuffer);
}

function buildNotificationExpiry(now: Date) {
  return new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
}

export async function POST(request: NextRequest) {
  try {
    // Verify authorization - only allow calls with valid CRON_SECRET
    const authHeader = request.headers.get("authorization");
    if (!verifyToken(authHeader, process.env.CRON_SECRET || "")) {
      console.error("Unauthorized batch notification request");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as {
      type?: string;
      /** false = 希望 JST 時刻に関係なく配信（1日1回の Cron 向け）。省略時は true。 */
      matchPreferredJstHour?: boolean;
    };
    const { type } = body;
    const matchPreferredJstHour = body.matchPreferredJstHour !== false;

    if (type === "deadline_reminders") {
      // 4-tier smart reminders: 7d, 3d, 1d, 0d (expanded from 3d window)
      const now = new Date();
      const in7d = new Date(now.getTime() + 7.5 * 24 * 60 * 60 * 1000);
      const jstDayStart = startOfJstDayAsUtc(now);

      const upcomingDeadlines = await db
        .select({
          deadline: deadlines,
          company: {
            id: companies.id,
            name: companies.name,
            userId: companies.userId,
            guestId: companies.guestId,
          },
        })
        .from(deadlines)
        .leftJoin(companies, eq(deadlines.companyId, companies.id))
        .where(
          and(
            eq(deadlines.isConfirmed, true),
            isNull(deadlines.completedAt),
            lte(deadlines.dueDate, in7d),
            gt(deadlines.dueDate, now)
          )
        );

      const reminderUserIds = Array.from(
        new Set(
          upcomingDeadlines
            .map(({ company }) => company?.userId)
            .filter((value): value is string => typeof value === "string" && value.length > 0)
        )
      );
      const reminderGuestIds = Array.from(
        new Set(
          upcomingDeadlines
            .map(({ company }) => company?.guestId)
            .filter((value): value is string => typeof value === "string" && value.length > 0)
        )
      );

      const [settingsRows, existingNotifications] = await Promise.all([
        reminderUserIds.length > 0
          ? db
              .select({
                userId: notificationSettings.userId,
                deadlineReminder: notificationSettings.deadlineReminder,
                deadlineNear: notificationSettings.deadlineNear,
                deadlineReminderOverrides: notificationSettings.deadlineReminderOverrides,
              })
              .from(notificationSettings)
              .where(inArray(notificationSettings.userId, reminderUserIds))
          : Promise.resolve([]),
        reminderUserIds.length > 0 || reminderGuestIds.length > 0
          ? db
              .select({
                userId: notifications.userId,
                guestId: notifications.guestId,
                type: notifications.type,
                data: notifications.data,
              })
              .from(notifications)
              .where(
                and(
                  gte(notifications.createdAt, jstDayStart),
                  inArray(notifications.type, ["deadline_reminder", "deadline_near"]),
                  or(
                    reminderUserIds.length > 0
                      ? inArray(notifications.userId, reminderUserIds)
                      : isNull(notifications.userId),
                    reminderGuestIds.length > 0
                      ? inArray(notifications.guestId, reminderGuestIds)
                      : isNull(notifications.guestId)
                  )
                )
              )
          : Promise.resolve([]),
      ]);

      const settingsMap = new Map(
        settingsRows.map((row) => {
          let overrides: Record<string, ReminderTier[]> | null = null;
          if (row.deadlineReminderOverrides) {
            try { overrides = JSON.parse(row.deadlineReminderOverrides); } catch { /* ignore */ }
          }
          return [
            row.userId,
            {
              deadlineReminder: row.deadlineReminder,
              deadlineNear: row.deadlineNear,
              overrides,
            },
          ];
        })
      );

      // Per-deadline dedup: ownerKey:deadlineId:tier
      const existingKeys = new Set(
        existingNotifications.map((row) => {
          const owner = row.userId ? `user:${row.userId}` : row.guestId ? `guest:${row.guestId}` : "";
          let deadlineId = "";
          let tier = "";
          if (row.data) {
            try {
              const parsed = JSON.parse(row.data);
              deadlineId = parsed.deadlineId ?? "";
              tier = parsed.tier ?? "";
            } catch { /* ignore */ }
          }
          return `${owner}:${deadlineId}:${tier}`;
        })
      );

      // Flood prevention: max 5 notifications per owner per day
      const ownerNotifCount = new Map<string, number>();

      const notificationRows: NotificationInsertRow[] = [];
      for (const { deadline, company } of upcomingDeadlines) {
        const hoursUntilDue = (deadline.dueDate.getTime() - now.getTime()) / (1000 * 60 * 60);
        const tier = classifyTier(hoursUntilDue);
        if (!tier) continue;

        const ownerKey = company?.userId
          ? `user:${company.userId}`
          : company?.guestId
            ? `guest:${company.guestId}`
            : null;
        if (!ownerKey) continue;

        // Check user settings
        const settings = company?.userId ? settingsMap.get(company.userId) : undefined;
        if (settings) {
          if (!settings.deadlineReminder && !settings.deadlineNear) continue;
        }

        // Check if this tier is enabled for this deadline type
        const effectiveTiers = getEffectiveTiers(deadline.type, settings?.overrides);
        if (!effectiveTiers.includes(tier)) continue;

        // Per-deadline dedup
        if (existingKeys.has(`${ownerKey}:${deadline.id}:${tier}`)) continue;

        // Flood cap
        const currentCount = ownerNotifCount.get(ownerKey) ?? 0;
        if (currentCount >= 5) continue;
        ownerNotifCount.set(ownerKey, currentCount + 1);

        const notifType = tier === "0d" ? "deadline_near" : "deadline_reminder";
        const message = TIER_MESSAGES[tier];

        notificationRows.push({
          id: crypto.randomUUID(),
          userId: company?.userId,
          guestId: company?.guestId,
          type: notifType,
          title: message,
          message: `${company?.name || ""}の${deadline.title}の締切が近づいています`,
          data: JSON.stringify({
            deadlineId: deadline.id,
            companyId: deadline.companyId,
            dueDate: deadline.dueDate.toISOString(),
            tier,
          }),
          isRead: false,
          createdAt: now,
          expiresAt: buildNotificationExpiry(now),
        });
      }

      if (notificationRows.length > 0) {
        await db.insert(notifications).values(notificationRows);
      }

      return NextResponse.json({ success: true, created: notificationRows.length });
    }

    if (type === "cleanup") {
      // Delete notifications older than 90 days
      const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
      await db.delete(notifications).where(lte(notifications.createdAt, cutoff));
      return NextResponse.json({ success: true });
    }

    if (type === "daily_summary") {
      const now = new Date();
      const currentJstHour = getJstHour(now);
      const jstDayStart = startOfJstDayAsUtc(now);

      const profileRows = await db
        .select({
          userId: userProfiles.userId,
          dailySummary: notificationSettings.dailySummary,
          dailySummaryHourJst: notificationSettings.dailySummaryHourJst,
        })
        .from(userProfiles)
        .leftJoin(notificationSettings, eq(notificationSettings.userId, userProfiles.userId));

      const profileUserIds = profileRows.map((row) => row.userId);
      const in72h = new Date(now.getTime() + 72 * 60 * 60 * 1000);

      const [deadlineCountRows, existingRows] = await Promise.all([
        profileUserIds.length > 0
          ? db
              .select({
                userId: companies.userId,
                count: count(),
              })
              .from(deadlines)
              .innerJoin(companies, eq(deadlines.companyId, companies.id))
              .where(
                and(
                  eq(deadlines.isConfirmed, true),
                  isNull(deadlines.completedAt),
                  lte(deadlines.dueDate, in72h),
                  gt(deadlines.dueDate, now),
                  inArray(companies.userId, profileUserIds)
                )
              )
              .groupBy(companies.userId)
          : Promise.resolve([]),
        profileUserIds.length > 0
          ? db
              .select({
                userId: notifications.userId,
                type: notifications.type,
              })
              .from(notifications)
              .where(
                and(
                  eq(notifications.type, "daily_summary"),
                  gte(notifications.createdAt, jstDayStart),
                  inArray(notifications.userId, profileUserIds)
                )
              )
          : Promise.resolve([]),
      ]);

      const deadlineCountMap = new Map(
        deadlineCountRows.map((row) => [row.userId, Number(row.count ?? 0)])
      );
      const existingToday = new Set(
        existingRows.map((row) => `user:${row.userId}:${row.type}`)
      );
      const notificationRows: NotificationInsertRow[] = [];

      for (const profile of profileRows) {
        if (profile.dailySummary === false) continue;

        if (matchPreferredJstHour) {
          const preferredHour = profile.dailySummaryHourJst ?? 9;
          if (currentJstHour !== preferredHour) continue;
        }

        if (existingToday.has(`user:${profile.userId}:daily_summary`)) continue;

        const urgentDeadlineCount = deadlineCountMap.get(profile.userId) ?? 0;
        const message =
          urgentDeadlineCount > 0
            ? `今日は${urgentDeadlineCount}件の締切が近づいています。優先的に取り組みましょう。`
            : "今日の締切はありません。ES添削やガクチカ深掘りを進めましょう。";

        notificationRows.push({
          id: crypto.randomUUID(),
          userId: profile.userId,
          guestId: null,
          type: "daily_summary",
          title: "今日のサマリー",
          message,
          data: JSON.stringify({
            urgentDeadlineCount,
          }),
          isRead: false,
          createdAt: now,
          expiresAt: buildNotificationExpiry(now),
        });
      }

      if (notificationRows.length > 0) {
        await db.insert(notifications).values(notificationRows);
      }

      return NextResponse.json({ success: true, created: notificationRows.length, jstHour: currentJstHour });
    }

    return NextResponse.json({ error: "Invalid batch type" }, { status: 400 });
  } catch (error) {
    console.error("Batch notification error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
