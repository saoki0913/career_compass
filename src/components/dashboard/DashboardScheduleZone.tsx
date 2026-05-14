"use client";

import { useMemo, useState } from "react";
import type { DeadlinesPageData } from "@/lib/dto/dashboard";
import { useDeadlines } from "@/hooks/useDeadlines";
import { useCalendarEvents, useGoogleCalendar } from "@/hooks/useCalendar";
import { WeeklyScheduleView, getWeekDays } from "@/components/dashboard/WeeklyScheduleView";
import { DashboardScheduleSkeleton } from "@/components/skeletons/DashboardSkeleton";

type DashboardScheduleZoneProps = {
  initialDeadlines?: DeadlinesPageData;
  isGuest: boolean;
};

export function DashboardScheduleZone({
  initialDeadlines,
  isGuest,
}: DashboardScheduleZoneProps) {
  const [weekOffset, setWeekOffset] = useState(0);
  const deadlineLookaheadDays = Math.min(30, Math.max(7, 7 + weekOffset * 7));
  const { deadlines, isLoading: deadlinesLoading } = useDeadlines(
    deadlineLookaheadDays,
    initialDeadlines && initialDeadlines.periodDays === deadlineLookaheadDays ? { initialData: initialDeadlines } : {},
  );

  const weekDays = useMemo(() => getWeekDays(weekOffset), [weekOffset]);
  const weekStart = weekDays[0].toISOString();
  const weekEnd = weekDays[6].toISOString();
  const { events: calendarEvents, isLoading: calendarEventsLoading } = useCalendarEvents({
    start: weekStart,
    end: weekEnd,
    enabled: !isGuest,
  });
  const { isConnected: isCalendarConnected } = useGoogleCalendar();

  const scheduleDeadlines = useMemo(
    () =>
      deadlines.map((deadline) => ({
        id: deadline.id,
        companyId: deadline.companyId,
        company: deadline.company,
        type: deadline.type,
        title: deadline.title,
        dueDate: deadline.dueDate,
        daysLeft: deadline.daysLeft,
      })),
    [deadlines],
  );

  const isScheduleLoading = (deadlinesLoading && !initialDeadlines) || (!isGuest && calendarEventsLoading);

  if (isScheduleLoading) {
    return <DashboardScheduleSkeleton />;
  }

  return (
    <WeeklyScheduleView
      deadlines={scheduleDeadlines}
      calendarEvents={isGuest ? [] : calendarEvents}
      isGuest={isGuest}
      isConnected={isCalendarConnected}
      weekDays={weekDays}
      weekOffset={weekOffset}
      onPrevWeek={() => setWeekOffset((current) => current - 1)}
      onNextWeek={() => setWeekOffset((current) => current + 1)}
      onToday={() => setWeekOffset(0)}
    />
  );
}

