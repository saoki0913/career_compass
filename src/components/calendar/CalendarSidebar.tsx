"use client";

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn, getLocalDateKey } from "@/lib/utils";
import { CalendarEvent, DeadlineEvent, GoogleCalendarEvent } from "@/hooks/useCalendar";
import type { DisplayEvent } from "@/components/calendar/EventDetailModal";

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

function isDeadlineEvent(event: DisplayEvent): event is DeadlineEvent {
  return "eventType" in event && event.eventType === "deadline";
}

function isGoogleDisplayEvent(event: DisplayEvent): event is GoogleCalendarEvent & { type: "google" } {
  return "type" in event && event.type === "google";
}

function getDisplayEventTitle(event: DisplayEvent) {
  return "title" in event ? event.title : event.summary;
}

function getDisplayEventTone(event: DisplayEvent) {
  if (isDeadlineEvent(event)) {
    return {
      label: "締切",
      className: "border-red-200 bg-red-50 text-red-700",
      dotClassName: "bg-red-300",
    };
  }
  if (isGoogleDisplayEvent(event)) {
    return {
      label: "Google予定",
      className: "border-emerald-200 bg-emerald-50 text-emerald-700",
      dotClassName: "bg-emerald-300",
    };
  }
  return {
    label: "タスク",
    className: "border-blue-200 bg-blue-50 text-blue-700",
    dotClassName: "bg-blue-300",
  };
}

function formatTimeRange(start: string, end?: string) {
  const startTime = new Date(start).toLocaleTimeString("ja-JP", {
    hour: "2-digit",
    minute: "2-digit",
  });
  if (!end) return startTime;
  const endTime = new Date(end).toLocaleTimeString("ja-JP", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${startTime} - ${endTime}`;
}

function getDisplayEventTime(event: DisplayEvent) {
  if (isDeadlineEvent(event)) {
    return new Date(event.dueDate).toLocaleDateString("ja-JP", {
      month: "short",
      day: "numeric",
    });
  }
  if (isGoogleDisplayEvent(event)) {
    if (event.start.dateTime) {
      return formatTimeRange(event.start.dateTime, event.end.dateTime);
    }
    if (event.start.date) {
      return "終日";
    }
    return null;
  }
  if ("startAt" in event) {
    return formatTimeRange(event.startAt, event.endAt);
  }
  return null;
}

interface CalendarSidebarProps {
  deadlines: DeadlineEvent[];
  events: CalendarEvent[];
  googleEvents: GoogleCalendarEvent[];
  selectedDate: Date | null;
  selectedDateDisplayEvents?: DisplayEvent[];
  isGoogleConnected: boolean;
  needsReconnect?: boolean;
  connectedEmail?: string | null;
  showConnectionStatus?: boolean;
  showOverviewCards?: boolean;
  showSelectedDateCard?: boolean;
  showMonthSummary?: boolean;
}

export function CalendarSidebar({
  deadlines,
  events,
  googleEvents,
  selectedDate,
  selectedDateDisplayEvents,
  isGoogleConnected,
  needsReconnect = false,
  connectedEmail,
  showConnectionStatus = true,
  showOverviewCards = true,
  showSelectedDateCard = true,
  showMonthSummary = false,
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

  const todayEvents = events
    .filter((e) => getLocalDateKey(e.startAt) === todayKey);

  // Get selected date events
  const selectedDateKey = selectedDate ? getLocalDateKey(selectedDate) : null;
  const selectedDateDeadlines = selectedDateKey
    ? deadlines.filter((d) => getLocalDateKey(d.dueDate) === selectedDateKey)
    : [];
  const selectedDateLocalEvents = selectedDateKey
    ? events.filter((e) => getLocalDateKey(e.startAt) === selectedDateKey)
    : [];
  const selectedDisplayEvents = selectedDateDisplayEvents ?? [
    ...selectedDateDeadlines,
    ...selectedDateLocalEvents,
  ];
  const monthDeadlineCount = deadlines.filter((deadline) => !deadline.completedAt).length;

  return (
    <div className="space-y-4">
      {/* Google Connection Status */}
      {showConnectionStatus && (
        <Card className={cn(
          "rounded-[22px] border bg-white shadow-[0_12px_34px_rgba(15,23,42,0.07)]",
          needsReconnect ? "border-amber-300 bg-amber-50/80" : isGoogleConnected ? "border-emerald-200 bg-emerald-50/60" : "border-slate-200"
        )}>
          <CardContent className="px-5 py-4">
            <Link href="/calendar/settings" className="flex min-h-14 items-center justify-between gap-4">
              <div className="flex min-w-0 items-center gap-3">
                <GoogleIcon />
                <div className="min-w-0">
                  <p className={cn(
                    "truncate text-sm font-semibold",
                    needsReconnect ? "text-amber-700" : isGoogleConnected ? "text-emerald-700" : "text-slate-600"
                  )}>
                    {needsReconnect ? "Google再連携が必要です" : isGoogleConnected ? "Googleカレンダー連携中" : "Googleカレンダーを連携"}
                  </p>
                  {connectedEmail && isGoogleConnected && !needsReconnect && (
                    <p className="truncate text-xs text-slate-500">{connectedEmail}</p>
                  )}
                </div>
              </div>
              {isGoogleConnected && !needsReconnect ? (
                <span className="text-emerald-600" aria-label="連携済み"><CheckCircleIcon /></span>
              ) : (
                <span className="shrink-0 text-sm font-semibold text-sky-600">設定</span>
              )}
            </Link>
          </CardContent>
        </Card>
      )}

      {/* This Week's Deadlines */}
      {showOverviewCards && (
        <Card className="rounded-[22px] border border-slate-200 bg-white shadow-[0_12px_34px_rgba(15,23,42,0.07)]">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-3 text-base font-semibold text-slate-900">
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-amber-50 text-slate-900 shadow-sm">
                <AlertIcon />
              </span>
              今週の締切
              {thisWeekDeadlines.length > 0 && (
                <Badge variant="secondary" className="ml-auto rounded-full bg-slate-100 text-slate-700">
                  {thisWeekDeadlines.length}件
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {thisWeekDeadlines.length === 0 ? (
              <p className="text-sm text-slate-500">今週の締切はありません</p>
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
                        "block rounded-xl border px-3 py-2.5 transition-colors hover:shadow-sm",
                        colors.bg,
                        colors.border
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className={cn("truncate text-sm font-semibold", colors.text)}>
                            {deadline.title}
                          </p>
                          <p className="truncate text-xs text-slate-500">
                            {deadline.companyName}
                          </p>
                        </div>
                        <Badge
                          variant="outline"
                          className={cn("shrink-0 rounded-full text-xs", colors.bg, colors.text, colors.border)}
                        >
                          {formatDaysLeft(daysLeft)}
                        </Badge>
                      </div>
                    </Link>
                  );
                })}
                {thisWeekDeadlines.length > 5 && (
                  <p className="pt-1 text-center text-xs text-slate-500">
                    他 {thisWeekDeadlines.length - 5} 件
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Today's Schedule */}
      {showOverviewCards && (
        <Card className="rounded-[22px] border border-slate-200 bg-white shadow-[0_12px_34px_rgba(15,23,42,0.07)]">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-3 text-base font-semibold text-slate-900">
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-sky-50 text-slate-900 shadow-sm">
                <ClockIcon />
              </span>
              今日の予定
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {todayEvents.length === 0 && todayGoogleEvents.length === 0 ? (
              <p className="text-sm text-slate-500">今日の予定はありません</p>
            ) : (
              <div className="space-y-2">
                {todayEvents.map((event) => (
                  <div
                    key={event.id}
                    className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2.5"
                  >
                    <p className="truncate text-sm font-semibold text-blue-700">{event.title}</p>
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
                    className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5"
                  >
                    <p className="truncate text-sm font-semibold text-emerald-700">{event.summary}</p>
                    {event.start.dateTime && (
                      <p className="text-xs text-emerald-600">
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
      )}

      {/* Selected Date Details */}
      {showSelectedDateCard && selectedDate && (
        <Card className="rounded-[22px] border border-sky-200 bg-sky-50/60 shadow-[0_12px_34px_rgba(15,23,42,0.07)]">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-3 text-base font-semibold text-slate-900">
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-slate-900 shadow-sm">
                <CalendarIcon />
              </span>
              {selectedDate.toLocaleDateString("ja-JP", {
                month: "long",
                day: "numeric",
                weekday: "short",
              })}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {selectedDisplayEvents.length === 0 ? (
              <p className="text-sm text-slate-500">この日の予定はありません</p>
            ) : (
              <div className="space-y-2">
                {selectedDisplayEvents.map((event, index) => {
                  const tone = getDisplayEventTone(event);
                  const eventTime = getDisplayEventTime(event);
                  return (
                    <div
                      key={"id" in event ? event.id : `selected-${index}`}
                      className={cn("rounded-xl border px-3 py-2.5", tone.className)}
                    >
                      <div className="flex items-center gap-2">
                        <span className={cn("h-2 w-2 rounded-full", tone.dotClassName)} />
                        <p className="min-w-0 flex-1 truncate text-sm font-semibold">
                          {getDisplayEventTitle(event)}
                        </p>
                        <span className="shrink-0 text-[11px] font-medium">{tone.label}</span>
                      </div>
                      {isDeadlineEvent(event) && event.companyName && (
                        <p className="mt-1 truncate pl-4 text-xs text-slate-500">{event.companyName}</p>
                      )}
                      {eventTime && (
                        <p className="mt-1 truncate pl-4 text-xs font-medium text-slate-500">{eventTime}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {showMonthSummary && (
        <Card className="rounded-[22px] border border-slate-200 bg-white shadow-[0_12px_34px_rgba(15,23,42,0.07)]">
          <CardContent className="flex min-h-20 items-center justify-between gap-4 px-5 py-4">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-900 text-white shadow-sm">
                <CalendarIcon />
              </span>
              <span className="text-base font-semibold text-slate-700">月の締切</span>
              <Badge variant="secondary" className="rounded-full bg-sky-100 px-3 text-sm text-slate-700">
                {monthDeadlineCount}件
              </Badge>
            </div>
            <svg className="h-4 w-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 9l6 6 6-6" />
            </svg>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
