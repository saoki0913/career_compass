"use client";

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn, getLocalDateKey } from "@/lib/utils";
import { CalendarEvent, DeadlineEvent, GoogleCalendarEvent } from "@/hooks/useCalendar";

// Icons
const CalendarIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
    />
  </svg>
);

const ClockIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
    />
  </svg>
);

const AlertIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
    />
  </svg>
);

const CheckCircleIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
    />
  </svg>
);

const GoogleIcon = () => (
  <svg className="w-4 h-4" viewBox="0 0 24 24">
    <path
      fill="#4285F4"
      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
    />
    <path
      fill="#34A853"
      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
    />
    <path
      fill="#FBBC05"
      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
    />
    <path
      fill="#EA4335"
      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
    />
  </svg>
);

// Urgency color helpers
function getUrgencyColors(daysLeft: number) {
  if (daysLeft <= 1) {
    return {
      bg: "bg-red-100",
      text: "text-red-700",
      border: "border-red-300",
      dot: "bg-red-500",
    };
  }
  if (daysLeft <= 3) {
    return {
      bg: "bg-orange-100",
      text: "text-orange-700",
      border: "border-orange-300",
      dot: "bg-orange-500",
    };
  }
  if (daysLeft <= 7) {
    return {
      bg: "bg-amber-100",
      text: "text-amber-700",
      border: "border-amber-300",
      dot: "bg-amber-500",
    };
  }
  return {
    bg: "bg-emerald-100",
    text: "text-emerald-700",
    border: "border-emerald-300",
    dot: "bg-emerald-500",
  };
}

function getDaysLeft(dueDate: string | Date): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dueDate);
  due.setHours(0, 0, 0, 0);
  return Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function formatDaysLeft(daysLeft: number): string {
  if (daysLeft < 0) return "期限切れ";
  if (daysLeft === 0) return "今日";
  if (daysLeft === 1) return "明日";
  return `あと${daysLeft}日`;
}

interface CalendarSidebarProps {
  deadlines: DeadlineEvent[];
  events: CalendarEvent[];
  googleEvents: GoogleCalendarEvent[];
  selectedDate: Date | null;
  isGoogleConnected: boolean;
  onDateClick?: (date: Date) => void;
}

export function CalendarSidebar({
  deadlines,
  events,
  googleEvents,
  selectedDate,
  isGoogleConnected,
}: CalendarSidebarProps) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Get this week's deadlines (next 7 days)
  const weekEnd = new Date(today);
  weekEnd.setDate(weekEnd.getDate() + 7);

  const thisWeekDeadlines = deadlines
    .filter((d) => {
      if (d.completedAt) return false;
      const dueDate = new Date(d.dueDate);
      dueDate.setHours(0, 0, 0, 0);
      return dueDate >= today && dueDate <= weekEnd;
    })
    .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());

  // Get today's events
  const todayKey = getLocalDateKey(today);
  const todayGoogleEvents = googleEvents.filter((e) => {
    const startDate = e.start.dateTime || e.start.date;
    if (!startDate) return false;
    return getLocalDateKey(startDate) === todayKey;
  });

  // Build a Set of Google event keys for duplicate detection
  const googleEventKeys = new Set<string>();
  if (isGoogleConnected) {
    todayGoogleEvents.forEach((googleEvent) => {
      const startDateTime = googleEvent.start.dateTime || googleEvent.start.date;
      if (!startDateTime) return;
      const normalizedTitle = googleEvent.summary
        .replace("[就活Compass] ", "")
        .toLowerCase()
        .trim();
      const startMinute = Math.floor(new Date(startDateTime).getTime() / 60000);
      googleEventKeys.add(`${normalizedTitle}|${startMinute}`);
    });
  }

  // Filter out duplicates from app events when Google is connected
  const todayEvents = events
    .filter((e) => getLocalDateKey(e.startAt) === todayKey)
    .filter((event) => {
      if (!isGoogleConnected || event.type !== "work_block") return true;
      const normalizedTitle = event.title.toLowerCase().trim();
      const startMinute = Math.floor(new Date(event.startAt).getTime() / 60000);
      return !googleEventKeys.has(`${normalizedTitle}|${startMinute}`);
    });

  // Get selected date events
  const selectedDateKey = selectedDate ? getLocalDateKey(selectedDate) : null;
  const selectedDateDeadlines = selectedDateKey
    ? deadlines.filter((d) => getLocalDateKey(d.dueDate) === selectedDateKey)
    : [];
  const selectedDateEvents = selectedDateKey
    ? events.filter((e) => getLocalDateKey(e.startAt) === selectedDateKey)
    : [];

  return (
    <div className="space-y-4">
      {/* Google Connection Status */}
      <Card className={cn(isGoogleConnected ? "border-green-200 bg-green-50/50" : "border-border")}>
        <CardContent className="py-3 px-4">
          <div className="flex items-center gap-2">
            <GoogleIcon />
            <span className={cn("text-sm", isGoogleConnected ? "text-green-700" : "text-muted-foreground")}>
              {isGoogleConnected ? "Google連携済み" : "Google未連携"}
            </span>
            {isGoogleConnected && <CheckCircleIcon />}
          </div>
        </CardContent>
      </Card>

      {/* This Week's Deadlines */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <AlertIcon />
            今週の締切
            {thisWeekDeadlines.length > 0 && (
              <Badge variant="secondary" className="ml-auto">
                {thisWeekDeadlines.length}件
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {thisWeekDeadlines.length === 0 ? (
            <p className="text-sm text-muted-foreground">今週の締切はありません</p>
          ) : (
            <div className="space-y-2">
              {thisWeekDeadlines.slice(0, 5).map((deadline) => {
                const daysLeft = getDaysLeft(deadline.dueDate);
                const colors = getUrgencyColors(daysLeft);
                return (
                  <Link
                    key={deadline.id}
                    href={`/companies/${deadline.companyId}`}
                    className={cn(
                      "block p-2 rounded-lg border transition-colors hover:shadow-sm",
                      colors.bg,
                      colors.border
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className={cn("text-sm font-medium truncate", colors.text)}>
                          {deadline.title}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {deadline.companyName}
                        </p>
                      </div>
                      <Badge
                        variant="outline"
                        className={cn("text-xs shrink-0", colors.bg, colors.text, colors.border)}
                      >
                        {formatDaysLeft(daysLeft)}
                      </Badge>
                    </div>
                  </Link>
                );
              })}
              {thisWeekDeadlines.length > 5 && (
                <p className="text-xs text-muted-foreground text-center pt-1">
                  他 {thisWeekDeadlines.length - 5} 件
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Today's Schedule */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <ClockIcon />
            今日の予定
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {todayEvents.length === 0 && todayGoogleEvents.length === 0 ? (
            <p className="text-sm text-muted-foreground">今日の予定はありません</p>
          ) : (
            <div className="space-y-2">
              {todayEvents.map((event) => (
                <div
                  key={event.id}
                  className="p-2 rounded-lg bg-blue-50 border border-blue-200"
                >
                  <p className="text-sm font-medium text-blue-700">{event.title}</p>
                  <p className="text-xs text-blue-600">
                    {new Date(event.startAt).toLocaleTimeString("ja-JP", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}{" "}
                    -{" "}
                    {new Date(event.endAt).toLocaleTimeString("ja-JP", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
              ))}
              {todayGoogleEvents.map((event, i) => (
                <div
                  key={`google-${i}`}
                  className="p-2 rounded-lg bg-green-50 border border-green-200"
                >
                  <p className="text-sm font-medium text-green-700">{event.summary}</p>
                  {event.start.dateTime && (
                    <p className="text-xs text-green-600">
                      {new Date(event.start.dateTime).toLocaleTimeString("ja-JP", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                      {event.end.dateTime && (
                        <>
                          {" "}
                          -{" "}
                          {new Date(event.end.dateTime).toLocaleTimeString("ja-JP", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </>
                      )}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Selected Date Details */}
      {selectedDate && (
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <CalendarIcon />
              {selectedDate.toLocaleDateString("ja-JP", {
                month: "long",
                day: "numeric",
                weekday: "short",
              })}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {selectedDateDeadlines.length === 0 && selectedDateEvents.length === 0 ? (
              <p className="text-sm text-muted-foreground">この日の予定はありません</p>
            ) : (
              <div className="space-y-2">
                {selectedDateDeadlines.map((deadline) => {
                  const daysLeft = getDaysLeft(deadline.dueDate);
                  const colors = getUrgencyColors(daysLeft);
                  return (
                    <div
                      key={deadline.id}
                      className={cn("p-2 rounded-lg border", colors.bg, colors.border)}
                    >
                      <p className={cn("text-sm font-medium", colors.text)}>
                        {deadline.title}
                      </p>
                      <p className="text-xs text-muted-foreground">{deadline.companyName}</p>
                    </div>
                  );
                })}
                {selectedDateEvents.map((event) => (
                  <div
                    key={event.id}
                    className="p-2 rounded-lg bg-blue-50 border border-blue-200"
                  >
                    <p className="text-sm font-medium text-blue-700">{event.title}</p>
                    <p className="text-xs text-blue-600">
                      {new Date(event.startAt).toLocaleTimeString("ja-JP", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}{" "}
                      -{" "}
                      {new Date(event.endAt).toLocaleTimeString("ja-JP", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default CalendarSidebar;
