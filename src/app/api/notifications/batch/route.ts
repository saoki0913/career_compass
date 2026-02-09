/**
 * Notification Batch Processing API
 *
 * POST: Trigger batch notifications (deadline reminders, cleanup)
 * Called by cron job only - requires CRON_SECRET authorization
 */
import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { db } from "@/lib/db";
import { notifications, deadlines, tasks, companies, applications, userProfiles, notificationSettings } from "@/lib/db/schema";
import { eq, and, lte, gte, gt, lt, isNull, or } from "drizzle-orm";

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

function getJSTNow(): Date {
  const now = new Date();
  const jstOffset = 9 * 60;
  const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
  return new Date(utc + (jstOffset * 60000));
}

export async function POST(request: NextRequest) {
  try {
    // Verify authorization - only allow calls with valid CRON_SECRET
    const authHeader = request.headers.get("authorization");
    if (!verifyToken(authHeader, process.env.CRON_SECRET || "")) {
      console.error("Unauthorized batch notification request");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { type } = await request.json();

    if (type === "deadline_reminders") {
      // Find deadlines due within 24h and 3 days
      const now = new Date();
      const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      const in3d = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

      const upcomingDeadlines = await db
        .select({
          deadline: deadlines,
          company: { id: companies.id, name: companies.name },
        })
        .from(deadlines)
        .leftJoin(companies, eq(deadlines.companyId, companies.id))
        .where(
          and(
            eq(deadlines.isConfirmed, true),
            isNull(deadlines.completedAt),
            lte(deadlines.dueDate, in3d),
            gt(deadlines.dueDate, now)
          )
        );

	      let created = 0;
	      for (const { deadline, company } of upcomingDeadlines) {
	        const hoursUntilDue = (deadline.dueDate.getTime() - now.getTime()) / (1000 * 60 * 60);
	        const notifType = hoursUntilDue <= 24 ? "deadline_near" : "deadline_reminder";
	        const urgency = hoursUntilDue <= 24 ? "24時間以内" : "3日以内";
	
	        // Determine userId from company
	        const [companyData] = await db
	          .select()
	          .from(companies)
	          .where(eq(companies.id, deadline.companyId))
	          .limit(1);
	        if (!companyData) continue;
	
	        // Check user's notification settings
	        if (companyData.userId) {
	          const [settings] = await db
	            .select()
	            .from(notificationSettings)
	            .where(eq(notificationSettings.userId, companyData.userId))
	            .limit(1);

          // Skip if user has disabled this notification type
          if (settings) {
            if (notifType === "deadline_near" && !settings.deadlineNear) continue;
            if (notifType === "deadline_reminder" && !settings.deadlineReminder) continue;
          }
        }

        // Check if notification already exists for this deadline today
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const userCondition = companyData.userId
          ? eq(notifications.userId, companyData.userId)
          : companyData.guestId
            ? eq(notifications.guestId, companyData.guestId)
            : undefined;

        if (!userCondition) continue;

	        const [existingNotif] = await db
	          .select()
	          .from(notifications)
	          .where(
	            and(
	              userCondition,
	              eq(notifications.type, notifType),
	              gte(notifications.createdAt, todayStart)
	            )
	          )
	          .limit(1);
	
	        if (existingNotif) continue;

        // Create notification
        await db.insert(notifications).values({
          id: crypto.randomUUID(),
          userId: companyData.userId,
          guestId: companyData.guestId,
          type: notifType,
          title: `締切が${urgency}です`,
          message: `${company?.name || ""}の${deadline.title}の締切が近づいています`,
          data: JSON.stringify({
            deadlineId: deadline.id,
            companyId: deadline.companyId,
            dueDate: deadline.dueDate.toISOString(),
          }),
          isRead: false,
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
        });
        created++;
      }

      return NextResponse.json({ success: true, created });
    }

    if (type === "cleanup") {
      // Delete notifications older than 90 days
      const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
      await db.delete(notifications).where(lte(notifications.createdAt, cutoff));
      return NextResponse.json({ success: true });
    }

    if (type === "daily_summary") {
      // Generate daily summary for each user (JST 9:00)
      // Get all users with profiles
      const profiles = await db.select().from(userProfiles);
      let created = 0;

	      for (const profile of profiles) {
	        // Check user's notification settings
	        const [settings] = await db
	          .select()
	          .from(notificationSettings)
	          .where(eq(notificationSettings.userId, profile.userId))
	          .limit(1);

        if (settings && !settings.dailySummary) continue;

        // Get today's most important task
        const now = new Date();
        const in72h = new Date(now.getTime() + 72 * 60 * 60 * 1000);

        const urgentDeadlines = await db
          .select()
          .from(deadlines)
          .leftJoin(companies, eq(deadlines.companyId, companies.id))
          .where(
            and(
              eq(deadlines.isConfirmed, true),
              isNull(deadlines.completedAt),
              lte(deadlines.dueDate, in72h),
              gt(deadlines.dueDate, now)
            )
          );

        const message = urgentDeadlines.length > 0
          ? `今日は${urgentDeadlines.length}件の締切が近づいています。優先的に取り組みましょう。`
          : "今日の締切はありません。ES添削やガクチカ深掘りを進めましょう。";

        await db.insert(notifications).values({
          id: crypto.randomUUID(),
          userId: profile.userId,
          guestId: null,
          type: "daily_summary",
          title: "今日のサマリー",
          message,
          data: JSON.stringify({
            urgentDeadlineCount: urgentDeadlines.length,
          }),
          isRead: false,
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
        });
        created++;
      }

      return NextResponse.json({ success: true, created });
    }

    return NextResponse.json({ error: "Invalid batch type" }, { status: 400 });
  } catch (error) {
    console.error("Batch notification error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
