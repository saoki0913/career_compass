/**
 * Calendar Events API
 *
 * GET: List calendar events
 * POST: Create a calendar event
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { calendarEvents, deadlines, companies } from "@/lib/db/schema";
import { eq, and, gte, lte, desc } from "drizzle-orm";
import { headers } from "next/headers";

export async function GET(request: NextRequest) {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "ログインが必要です" },
        { status: 401 }
      );
    }

    const userId = session.user.id;

    const searchParams = request.nextUrl.searchParams;
    const startDate = searchParams.get("start");
    const endDate = searchParams.get("end");

    // Build conditions
    const conditions = [eq(calendarEvents.userId, userId)];
    if (startDate) {
      conditions.push(gte(calendarEvents.startAt, new Date(startDate)));
    }
    if (endDate) {
      conditions.push(lte(calendarEvents.endAt, new Date(endDate)));
    }

    // Get user's calendar events
    const events = await db
      .select()
      .from(calendarEvents)
      .where(and(...conditions))
      .orderBy(calendarEvents.startAt);

    // Also get deadlines to display on calendar
    const deadlineEvents = await db
      .select({
        id: deadlines.id,
        title: deadlines.title,
        type: deadlines.type,
        dueDate: deadlines.dueDate,
        companyId: deadlines.companyId,
        companyName: companies.name,
        isConfirmed: deadlines.isConfirmed,
        completedAt: deadlines.completedAt,
      })
      .from(deadlines)
      .leftJoin(companies, eq(deadlines.companyId, companies.id))
      .where(
        and(
          eq(companies.userId, userId),
          startDate ? gte(deadlines.dueDate, new Date(startDate)) : undefined,
          endDate ? lte(deadlines.dueDate, new Date(endDate)) : undefined
        )
      )
      .orderBy(deadlines.dueDate);

    return NextResponse.json({
      events,
      deadlines: deadlineEvents.map((d) => ({
        ...d,
        eventType: "deadline",
      })),
    });
  } catch (error) {
    console.error("Error fetching calendar events:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "ログインが必要です" },
        { status: 401 }
      );
    }

    const userId = session.user.id;
    const body = await request.json();
    const { type, title, startAt, endAt, deadlineId } = body;

    if (!title?.trim()) {
      return NextResponse.json(
        { error: "タイトルは必須です" },
        { status: 400 }
      );
    }

    if (!startAt || !endAt) {
      return NextResponse.json(
        { error: "開始・終了時刻は必須です" },
        { status: 400 }
      );
    }

    const validTypes = ["deadline", "work_block"];
    if (!validTypes.includes(type)) {
      return NextResponse.json(
        { error: "無効なイベント種類です" },
        { status: 400 }
      );
    }

    const newEvent = await db
      .insert(calendarEvents)
      .values({
        id: crypto.randomUUID(),
        userId,
        deadlineId: deadlineId || null,
        type,
        title: title.trim(),
        startAt: new Date(startAt),
        endAt: new Date(endAt),
        createdAt: new Date(),
      })
      .returning();

    return NextResponse.json({ event: newEvent[0] });
  } catch (error) {
    console.error("Error creating calendar event:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
