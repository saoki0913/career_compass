"use client";

import Link from "next/link";
import { Fragment, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardAction } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { CalendarEvent } from "@/hooks/useCalendar";

export interface ScheduleDeadline {
  id: string;
  companyId: string;
  company: string;
  type: string;
  title: string;
  dueDate: string;
  daysLeft: number;
}

export interface WeeklyScheduleViewProps {
  deadlines: ScheduleDeadline[];
  calendarEvents?: CalendarEvent[];
  isGuest?: boolean;
  isConnected?: boolean;
  weekDays: Date[];
  weekOffset: number;
  onPrevWeek: () => void;
  onNextWeek: () => void;
  onToday: () => void;
}

const typeColors: Record<string, { bg: string; text: string; dot: string }> = {
  es_submission: { bg: "bg-blue-50", text: "text-blue-700", dot: "bg-blue-500" },
  interview: { bg: "bg-purple-50", text: "text-purple-700", dot: "bg-purple-500" },
  interview_1: { bg: "bg-purple-50", text: "text-purple-700", dot: "bg-purple-500" },
  interview_2: { bg: "bg-purple-50", text: "text-purple-700", dot: "bg-purple-500" },
  final_interview: { bg: "bg-purple-50", text: "text-purple-700", dot: "bg-purple-500" },
  test: { bg: "bg-emerald-50", text: "text-emerald-700", dot: "bg-emerald-500" },
  web_test: { bg: "bg-emerald-50", text: "text-emerald-700", dot: "bg-emerald-500" },
  aptitude_test: { bg: "bg-emerald-50", text: "text-emerald-700", dot: "bg-emerald-500" },
  briefing: { bg: "bg-sky-50", text: "text-sky-700", dot: "bg-sky-500" },
  offer_response: { bg: "bg-amber-50", text: "text-amber-700", dot: "bg-amber-500" },
  deadline: { bg: "bg-orange-50", text: "text-orange-700", dot: "bg-orange-500" },
  work_block: { bg: "bg-indigo-50", text: "text-indigo-700", dot: "bg-indigo-500" },
  other: { bg: "bg-slate-50", text: "text-slate-600", dot: "bg-slate-400" },
};

const typeLabels: Record<string, string> = {
  es_submission: "ES",
  interview: "面接",
  interview_1: "1次",
  interview_2: "2次",
  final_interview: "最終",
  test: "テスト",
  web_test: "Web",
  aptitude_test: "適性",
  briefing: "説明会",
  internship: "IS",
  offer_response: "内定",
  other: "他",
};

const DAY_NAMES = ["月", "火", "水", "木", "金", "土", "日"] as const;
const TIME_SLOTS = ["09", "10", "11", "12", "13", "14", "15", "16", "17"] as const;

function toJSTDateKey(date: Date): string {
  return date.toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
}

export function getWeekDays(weekOffset: number = 0): Date[] {
  const now = new Date();
  const jstParts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const y = Number(jstParts.find((p) => p.type === "year")!.value);
  const m = Number(jstParts.find((p) => p.type === "month")!.value) - 1;
  const d = Number(jstParts.find((p) => p.type === "day")!.value);
  const today = new Date(y, m, d);

  const dayOfWeek = today.getDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday = new Date(today);
  monday.setDate(today.getDate() + mondayOffset + weekOffset * 7);

  return Array.from({ length: 7 }, (_, i) => {
    const day = new Date(monday);
    day.setDate(monday.getDate() + i);
    return day;
  });
}

function getJSTHour(isoDatetime: string): number {
  const date = new Date(isoDatetime);
  const hourStr = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tokyo",
    hour: "numeric",
    hour12: false,
  }).format(date);
  return parseInt(hourStr, 10);
}

function getNearestSlot(hour: number): string {
  for (let i = TIME_SLOTS.length - 1; i >= 0; i--) {
    if (hour >= parseInt(TIME_SLOTS[i], 10)) return TIME_SLOTS[i];
  }
  return TIME_SLOTS[0];
}

function getColorForType(type: string) {
  return typeColors[type] ?? typeColors.other;
}

const GoogleCalendarIcon = ({ className }: { className?: string }) => (
  <svg className={cn("h-5 w-5", className)} viewBox="0 0 200 200" aria-hidden="true">
    <path d="M152.637 43.363H47.363v109.274h105.274z" fill="#fff" />
    <path d="M152.637 200L200 152.637h-47.363z" fill="#1a73e8" />
    <path d="M200 47.363h-47.363v105.274H200z" fill="#4285f4" />
    <path d="M152.637 152.637H47.363V200h105.274z" fill="#34a853" />
    <path d="M0 152.637v31.576A15.79 15.79 0 0015.787 200H47.363v-47.363z" fill="#188038" />
    <path d="M200 47.363V15.787A15.79 15.79 0 00184.213 0H152.637v47.363z" fill="#1967d2" />
    <path d="M152.637 0H15.787A15.79 15.79 0 000 15.787V152.637h47.363V47.363h105.274z" fill="#fbbc04" />
    <path d="M76.17 132.34a27.3 27.3 0 01-10.6-7.86l8.37-6.89a18.07 18.07 0 006.45 5.65 17.1 17.1 0 008.22 2.14 14.49 14.49 0 009.91-3.47 11.08 11.08 0 003.99-8.53 11.49 11.49 0 00-4.2-9.07 16.35 16.35 0 00-10.72-3.55h-6.51v-10.2h5.84a14.17 14.17 0 009.38-3.26 10.36 10.36 0 003.78-8.16 9.67 9.67 0 00-3.47-7.65 12.92 12.92 0 00-8.79-3.05c-3.38 0-6.22.83-8.54 2.51a18.38 18.38 0 00-5.1 5.1l-8.37-6.89a28.14 28.14 0 019.07-8.53 26.67 26.67 0 0113.9-3.57 26.83 26.83 0 0111.66 2.51 20.64 20.64 0 018.22 7.1 18.14 18.14 0 013.05 10.37c0 4.1-1.2 7.72-3.62 10.87a19.3 19.3 0 01-8.9 6.82v.57a21.2 21.2 0 0110.56 7.36 19.27 19.27 0 014.1 12.34 21.15 21.15 0 01-3.36 11.76 22.58 22.58 0 01-9.38 8.1 30.38 30.38 0 01-13.84 2.96 30.22 30.22 0 01-13.89-3.37z" fill="#4285f4" />
    <path d="M128.23 57.84l10.07-7.56 12.6-2.45-5.65 10.24V131.9h-11.49V68.77l-5.53 4.17z" fill="#4285f4" />
  </svg>
);

interface SlotEvent {
  id: string;
  title: string;
  type: string;
}

const ChevronLeftIcon = () => (
  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
  </svg>
);

const ChevronRightNavIcon = () => (
  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
  </svg>
);

export function WeeklyScheduleView({ deadlines, calendarEvents = [], isGuest = false, isConnected = false, weekDays, weekOffset, onPrevWeek, onNextWeek, onToday }: WeeklyScheduleViewProps) {
  const todayKey = useMemo(() => toJSTDateKey(new Date()), []);

  const deadlinesByDate = useMemo(() => {
    const map = new Map<string, ScheduleDeadline[]>();
    for (const dl of deadlines) {
      const key = toJSTDateKey(new Date(dl.dueDate));
      const existing = map.get(key);
      if (existing) existing.push(dl);
      else map.set(key, [dl]);
    }
    return map;
  }, [deadlines]);

  const eventsByDateSlot = useMemo(() => {
    const map = new Map<string, SlotEvent[]>();
    for (const ev of calendarEvents) {
      const dateKey = toJSTDateKey(new Date(ev.startAt));
      const hour = getJSTHour(ev.startAt);
      const slot = getNearestSlot(hour);
      const cellKey = `${dateKey}_${slot}`;
      const existing = map.get(cellKey);
      const item: SlotEvent = { id: ev.id, title: ev.title, type: ev.type };
      if (existing) existing.push(item);
      else map.set(cellKey, [item]);
    }
    return map;
  }, [calendarEvents]);

  const weekKeys = useMemo(() => new Set(weekDays.map((d) => toJSTDateKey(d))), [weekDays]);

  const hasContent = useMemo(
    () =>
      deadlines.some((dl) => weekKeys.has(toJSTDateKey(new Date(dl.dueDate)))) ||
      calendarEvents.length > 0,
    [deadlines, calendarEvents, weekKeys],
  );

  return (
    <Card className="h-full min-h-0 overflow-hidden border-border/50 py-1.5 gap-1.5">
      <CardHeader className="flex shrink-0 flex-col gap-2 px-4 sm:flex-row sm:items-center sm:justify-between lg:px-5">
        <div className="flex items-center gap-2">
          <GoogleCalendarIcon />
          <CardTitle className="text-lg">スケジュール・選考管理</CardTitle>
          {!isGuest && (
            isConnected ? (
              <span className="flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-600">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                連携中
              </span>
            ) : (
              <Link href="/calendar" className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground hover:text-primary transition-colors">
                カレンダー連携
              </Link>
            )
          )}
        </div>
        <CardAction className="w-full self-auto justify-self-auto sm:w-auto">
          <div className="flex items-center gap-1 sm:justify-end">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onPrevWeek}>
              <ChevronLeftIcon />
            </Button>
            <Button
              variant={weekOffset === 0 ? "default" : "outline"}
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={onToday}
            >
              今日
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onNextWeek}>
              <ChevronRightNavIcon />
            </Button>
            <Button variant="outline" size="sm" className="hidden h-7 sm:inline-flex" asChild>
              <Link href="/calendar">カレンダー</Link>
            </Button>
          </div>
        </CardAction>
      </CardHeader>

      <CardContent className="min-h-0 flex-1 overflow-hidden px-4 lg:px-5">
        <div className="h-full overflow-x-auto lg:overflow-hidden" role="grid" aria-label="週間スケジュール">
          <div className="grid h-full min-w-[480px] grid-cols-[2.5rem_repeat(7,minmax(0,1fr))] grid-rows-[auto_repeat(10,minmax(0,1fr))] lg:min-w-0">
            {/* Day headers */}
            <div />
            {weekDays.map((date, i) => {
              const key = toJSTDateKey(date);
              const isToday = key === todayKey;
              const isWeekend = i >= 5;
              const month = date.getMonth() + 1;
              const dayNum = date.getDate();
              return (
                <div
                  key={key}
                  className={cn(
                    "flex flex-col items-center gap-0.5 pb-1 pt-1",
                    isToday && "rounded-t-lg bg-blue-50/50",
                  )}
                >
                  <span
                    className={cn(
                      "text-[10px] font-medium leading-none",
                      isToday ? "text-blue-600" : isWeekend ? "text-muted-foreground/60" : "text-muted-foreground",
                    )}
                  >
                    {DAY_NAMES[i]}
                  </span>
                  <span className={cn("text-xs font-semibold leading-none", isToday ? "text-blue-700" : "text-foreground")}>
                    {month}/{dayNum}
                  </span>
                  {isToday && <Badge variant="default" className="mt-0.5 h-3.5 px-1 text-[8px] leading-none">今日</Badge>}
                </div>
              );
            })}

            {/* All-day row (deadlines) */}
            <div className="flex items-center justify-center border-t border-border/30 py-1">
              <span className="text-[9px] font-medium text-muted-foreground">終日</span>
            </div>
            {weekDays.map((date) => {
              const key = toJSTDateKey(date);
              const isToday = key === todayKey;
              const dayDeadlines = deadlinesByDate.get(key) ?? [];
              return (
                <div
                  key={`allday-${key}`}
                  className={cn(
                    "flex min-h-0 flex-wrap items-start gap-0.5 overflow-hidden border-t border-border/30 px-0.5 py-0.5",
                    isToday && "bg-blue-50/30",
                  )}
                >
                  {dayDeadlines.slice(0, 2).map((dl) => {
                    const color = getColorForType(dl.type);
                    const label = typeLabels[dl.type] ?? dl.type;
                    return (
                      <Link
                        key={dl.id}
                        href={`/companies/${dl.companyId}`}
                        className={cn(
                          "flex items-center gap-0.5 rounded px-1 py-0.5 transition-colors hover:shadow-sm",
                          color.bg,
                        )}
                        title={`${dl.company} - ${label}`}
                      >
                        <span className={cn("h-1 w-1 shrink-0 rounded-full", color.dot)} />
                        <span className={cn("truncate text-[9px] font-medium leading-none", color.text)}>
                          {label}
                        </span>
                      </Link>
                    );
                  })}
                  {dayDeadlines.length > 2 && (
                    <span className="text-[8px] text-muted-foreground">+{dayDeadlines.length - 2}</span>
                  )}
                </div>
              );
            })}

            {/* Time slot rows */}
            {TIME_SLOTS.map((slot) => (
              <Fragment key={slot}>
                <div className="flex items-start justify-center border-t border-border/20 pt-1">
                  <span className="text-[9px] font-medium text-muted-foreground">{slot}</span>
                </div>
                {weekDays.map((date) => {
                  const dateKey = toJSTDateKey(date);
                  const isToday = dateKey === todayKey;
                  const cellKey = `${dateKey}_${slot}`;
                  const events = eventsByDateSlot.get(cellKey) ?? [];
                  return (
                    <div
                      key={`slot-${cellKey}`}
                      className={cn(
                        "min-h-0 overflow-hidden border-t border-border/20 px-0.5 py-0.5",
                        isToday && "bg-blue-50/30",
                      )}
                    >
                      {events.slice(0, 1).map((ev) => {
                        const color = getColorForType(ev.type);
                        return (
                          <div
                            key={ev.id}
                            className={cn(
                              "rounded-sm px-1 py-0.5",
                              color.bg,
                            )}
                          >
                            <span className={cn("block truncate text-[9px] font-medium leading-tight", color.text)}>
                              {ev.title}
                            </span>
                          </div>
                        );
                      })}
                      {events.length > 1 && (
                        <span className="text-[8px] text-muted-foreground">+{events.length - 1}</span>
                      )}
                    </div>
                  );
                })}
              </Fragment>
            ))}
          </div>
        </div>

        {!hasContent && (
          <p className="pt-1 text-center text-xs text-muted-foreground">今週の予定はありません</p>
        )}
      </CardContent>
    </Card>
  );
}
