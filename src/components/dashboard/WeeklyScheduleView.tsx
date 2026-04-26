"use client";

import Link from "next/link";
import { Fragment, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardAction } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useGoogleCalendar } from "@/hooks/useCalendar";
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
const TIME_SLOTS = ["09", "11", "13", "15", "17"] as const;

function toJSTDateKey(date: Date): string {
  return date.toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
}

export function getWeekDays(): Date[] {
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
  monday.setDate(today.getDate() + mondayOffset);

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

const CalendarIcon = ({ className }: { className?: string }) => (
  <svg className={cn("h-5 w-5", className)} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
  </svg>
);

const EmptyCalendarIcon = () => (
  <svg className="h-8 w-8 text-muted-foreground/40" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
  </svg>
);

interface SlotEvent {
  id: string;
  title: string;
  type: string;
}

export function WeeklyScheduleView({ deadlines, calendarEvents = [], isGuest = false }: WeeklyScheduleViewProps) {
  const { isConnected } = useGoogleCalendar();
  const weekDays = useMemo(() => getWeekDays(), []);
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
    <Card className="border-border/50 py-1.5 gap-1.5">
      <CardHeader className="flex flex-row items-center justify-between">
        <div className="flex items-center gap-2">
          <CalendarIcon className="text-muted-foreground" />
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
        <CardAction>
          <Button variant="outline" size="sm" asChild>
            <Link href="/calendar">カレンダー</Link>
          </Button>
        </CardAction>
      </CardHeader>

      <CardContent>
        <div className="overflow-x-auto" role="grid" aria-label="週間スケジュール">
          <div className="grid min-w-[480px] grid-cols-[2.5rem_repeat(7,1fr)]">
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
            {weekDays.map((date, i) => {
              const key = toJSTDateKey(date);
              const isToday = key === todayKey;
              const dayDeadlines = deadlinesByDate.get(key) ?? [];
              return (
                <div
                  key={`allday-${key}`}
                  className={cn(
                    "flex min-h-[24px] flex-wrap items-start gap-0.5 border-t border-border/30 px-0.5 py-0.5",
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
                {weekDays.map((date, i) => {
                  const dateKey = toJSTDateKey(date);
                  const isToday = dateKey === todayKey;
                  const cellKey = `${dateKey}_${slot}`;
                  const events = eventsByDateSlot.get(cellKey) ?? [];
                  return (
                    <div
                      key={`slot-${cellKey}`}
                      className={cn(
                        "min-h-[24px] border-t border-border/20 px-0.5 py-0.5",
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
          <div className="flex items-center justify-center gap-2 pt-1 pb-1">
            <EmptyCalendarIcon />
            <p className="text-xs text-muted-foreground">今週の予定はありません</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
