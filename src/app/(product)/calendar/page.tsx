"use client";

import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn, getLocalDateKey } from "@/lib/utils";
import { Sheet, SheetContent, SheetTrigger, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { useCalendarEvents, useGoogleCalendar, GoogleCalendarEvent, WorkBlockSuggestion } from "@/hooks/useCalendar";
import { CalendarSidebar } from "@/components/calendar/CalendarSidebar";
import { WorkBlockSuggestionsModal } from "@/components/calendar/WorkBlockSuggestionsModal";
import { WorkBlockFAB } from "@/components/calendar/WorkBlockFAB";
import { EventDetailModal, type DisplayEvent } from "@/components/calendar/EventDetailModal";
import {
  notifyCalendarEventCreated,
  notifyCalendarEventDeleted,
  notifyCalendarSynced,
  notifyCalendarSyncFailed,
} from "@/lib/notifications";
import { toAppUiError } from "@/lib/api-errors";
import { notifyUserFacingAppError } from "@/lib/client-error-ui";

// Icons
const ChevronLeftIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
  </svg>
);

const ChevronRightIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
  </svg>
);

const SettingsIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
    />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
);

const LoadingSpinner = () => (
  <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path
      className="opacity-75"
      fill="currentColor"
      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
    />
  </svg>
);

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

function notifyCalendarSyncResult(calendarSync?: { status?: string }) {
  if (calendarSync?.status === "synced") {
    notifyCalendarSynced();
  } else if (calendarSync?.status === "failed") {
    notifyCalendarSyncFailed();
  }
}

interface AddEventModalProps {
  isOpen: boolean;
  selectedDate: Date | null;
  onClose: () => void;
  onCreate: (data: {
    type: "work_block";
    title: string;
    startAt: string;
    endAt: string;
  }) => Promise<void>;
}

function AddEventModal({ isOpen, selectedDate, onClose, onCreate }: AddEventModalProps) {
  const [title, setTitle] = useState("");
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("10:00");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setTitle("");
      setStartTime("09:00");
      setEndTime("10:00");
      setError(null);
    }
  }, [isOpen]);

  // Escape key to close
  useEffect(() => {
    if (!isOpen) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isOpen, onClose]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !selectedDate) {
      setError("タイトルを入力してください");
      return;
    }

    if (startTime >= endTime) {
      setError("終了時刻は開始時刻より後にしてください");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const [startH, startM] = startTime.split(":").map(Number);
      const [endH, endM] = endTime.split(":").map(Number);
      const startDate = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate(), startH, startM);
      const endDate = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate(), endH, endM);
      await onCreate({
        type: "work_block",
        title: title.trim(),
        startAt: startDate.toISOString(),
        endAt: endDate.toISOString(),
      });
      onClose();
    } catch (err) {
      setError(
        toAppUiError(
          err,
          {
            code: "CALENDAR_EVENT_SUBMIT_FAILED",
            userMessage: "イベントを保存できませんでした。",
          },
          "CalendarPage:submitEvent",
        ).message,
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen || !selectedDate) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]" onClick={onClose}>
      <Card className="max-h-[min(80vh,42rem)] w-full max-w-md overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <CardHeader>
          <CardTitle>タスクを追加</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="p-3 rounded-lg bg-red-50 border border-red-200">
                <p className="text-sm text-red-800">{error}</p>
              </div>
            )}

            <div className="space-y-2">
              <Label>日付</Label>
              <p className="text-sm">
                {selectedDate.toLocaleDateString("ja-JP", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                  weekday: "short",
                })}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="title">タイトル *</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="ES作成、企業研究など"
                autoFocus
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="startTime">開始時刻</Label>
                <Input
                  id="startTime"
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="endTime">終了時刻</Label>
                <Input
                  id="endTime"
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
                キャンセル
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <LoadingSpinner />
                    <span className="ml-2">追加中...</span>
                  </>
                ) : (
                  "追加"
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

export default function CalendarPage() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showSuggestionsModal, setShowSuggestionsModal] = useState(false);
  const [googleEvents, setGoogleEvents] = useState<GoogleCalendarEvent[]>([]);
  const [workBlockSuggestions, setWorkBlockSuggestions] = useState<WorkBlockSuggestion[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<DisplayEvent | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [dayDetailDate, setDayDetailDate] = useState<Date | null>(null);
  const [dayDetailEvents, setDayDetailEvents] = useState<DisplayEvent[]>([]);
  const [dismissedError, setDismissedError] = useState<string | null>(null);
  const [showMobileSidebar, setShowMobileSidebar] = useState(false);

  // Calculate month range for API
  const monthStart = useMemo(() => {
    const date = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
    return date.toISOString();
  }, [currentDate]);

  const monthEnd = useMemo(() => {
    const date = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0, 23, 59, 59);
    return date.toISOString();
  }, [currentDate]);

  const { events, deadlines, isLoading, error, createEvent, deleteEvent } = useCalendarEvents({
    start: monthStart,
    end: monthEnd,
  });

  const {
    isConnected: isGoogleConnected,
    connectionStatus,
    isLoading: isGoogleLoading,
    fetchGoogleEvents,
    suggestWorkBlocks,
  } = useGoogleCalendar();

  // Fetch Google Calendar events when month changes.
  // Do not depend on the whole hook return object — it is a new reference every render, and
  // fetchGoogleEvents toggles loading state which would retrigger this effect infinitely.
  useEffect(() => {
    if (!isGoogleConnected) {
      return;
    }

    let cancelled = false;

    fetchGoogleEvents(monthStart, monthEnd).then((nextEvents) => {
      if (!cancelled) {
        setGoogleEvents(nextEvents);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [isGoogleConnected, fetchGoogleEvents, monthStart, monthEnd]);

  const effectiveGoogleEvents = useMemo(
    () => (isGoogleConnected ? googleEvents : []),
    [isGoogleConnected, googleEvents],
  );

  // Generate calendar days
  const calendarDays = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);

    const days: Date[] = [];

    // Add days from previous month
    for (let i = firstDay.getDay(); i > 0; i--) {
      days.push(new Date(year, month, 1 - i));
    }

    // Add days of current month
    for (let i = 1; i <= lastDay.getDate(); i++) {
      days.push(new Date(year, month, i));
    }

    // Add days from next month
    const remaining = 7 - (days.length % 7);
    if (remaining < 7) {
      for (let i = 1; i <= remaining; i++) {
        days.push(new Date(year, month + 1, i));
      }
    }

    return days;
  }, [currentDate]);

  // Group events by date. Google API only returns non-app-managed events,
  // so local deadlines/work blocks remain the source of truth.
  const eventsByDate = useMemo(() => {
    const map = new Map<string, DisplayEvent[]>();

    events.forEach((event) => {
      const dateKey = getLocalDateKey(event.startAt);
      if (!map.has(dateKey)) {
        map.set(dateKey, []);
      }
      map.get(dateKey)!.push(event);
    });

    // Add deadlines (always shown - not duplicated to Google)
    deadlines.forEach((deadline) => {
      const dateKey = getLocalDateKey(deadline.dueDate);
      if (!map.has(dateKey)) {
        map.set(dateKey, []);
      }
      map.get(dateKey)!.push(deadline);
    });

    // Add Google Calendar events (with full data for detail modal)
    effectiveGoogleEvents.forEach((googleEvent) => {
      const startDateTime = googleEvent.start.dateTime || googleEvent.start.date;
      if (!startDateTime) return;
      const dateKey = getLocalDateKey(startDateTime);
      if (!map.has(dateKey)) {
        map.set(dateKey, []);
      }
      map.get(dateKey)!.push({
        ...googleEvent,
        type: "google",
        title: googleEvent.summary,
      } as DisplayEvent);
    });

    return map;
  }, [events, deadlines, effectiveGoogleEvents]);

  const prevMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  };

  const nextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  };

  const today = new Date();
  const todayKey = getLocalDateKey(today);

  const handleDayClick = (day: Date) => {
    setSelectedDate(day);
    setShowAddModal(true);
  };

  const handleSuggestWorkBlocks = async (day: Date) => {
    setSelectedDate(day);
    setShowSuggestionsModal(true);
    const dateStr = getLocalDateKey(day);
    try {
      const suggestions = await suggestWorkBlocks(dateStr);
      setWorkBlockSuggestions(suggestions);
    } catch (error) {
      setShowSuggestionsModal(false);
      setSelectedDate(null);
      setWorkBlockSuggestions([]);
      const ui = toAppUiError(
        error,
        {
          code: "CALENDAR_WORK_BLOCK_SUGGESTIONS_FAILED",
          userMessage: "作業ブロックの提案を取得できませんでした。",
        },
        "CalendarPage:suggestWorkBlocks",
      );
      notifyUserFacingAppError(ui);
    }
  };

  const handleCreateEvent = async (data: {
    type: "work_block";
    title: string;
    startAt: string;
    endAt: string;
  }) => {
    try {
      const result = await createEvent(data);
      notifyCalendarEventCreated("manual");
      notifyCalendarSyncResult(result.calendarSync);
    } catch (error) {
      const ui = toAppUiError(
        error,
        {
          code: "CALENDAR_EVENT_CREATE_FAILED",
          userMessage: "イベントを作成できませんでした。",
        },
        "CalendarPage:createEvent",
      );
      notifyUserFacingAppError(ui);
      throw error;
    }
  };

  const handleCreateFromSuggestion = async (suggestion: WorkBlockSuggestion) => {
    try {
      const result = await createEvent({
        type: "work_block",
        title: suggestion.title,
        startAt: suggestion.start,
        endAt: suggestion.end,
      });
      notifyCalendarEventCreated("work_block");
      notifyCalendarSyncResult(result.calendarSync);
    } catch (error) {
      const ui = toAppUiError(
        error,
        {
          code: "CALENDAR_WORK_BLOCK_CREATE_FAILED",
          userMessage: "作業ブロックを作成できませんでした。",
        },
        "CalendarPage:createWorkBlock",
      );
      notifyUserFacingAppError(ui);
      throw error;
    }
  };

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-background">

      <main className="flex max-w-7xl flex-1 flex-col overflow-hidden px-4 pt-4 max-lg:pb-4 sm:px-6 lg:px-8 lg:pb-4">
        {/* Header */}
        <div className="mb-4 flex shrink-0 flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-xl font-bold sm:text-2xl">カレンダー</h1>
            <p className="mt-1 text-muted-foreground">締切とタスクを管理</p>
          </div>
          <div className="flex w-full min-w-0 flex-wrap items-center gap-2 sm:w-auto sm:justify-end sm:gap-3">
            <Button variant="ghost" asChild className="shrink-0">
              <Link href="/dashboard">
                <span className="sm:hidden">ホーム</span>
                <span className="hidden sm:inline">ホームに戻る</span>
              </Link>
            </Button>
            <Button variant="outline" asChild className="shrink-0">
              <Link href="/calendar/settings">
                <SettingsIcon />
                <span className="ml-1.5">{connectionStatus?.needsReconnect ? "再連携" : "設定"}</span>
              </Link>
            </Button>
          </div>
        </div>

        {/* Error */}
        {error && dismissedError !== error && (
          <Card className="mb-4 border-amber-200 bg-amber-50/50 shrink-0">
            <CardContent className="py-3">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm text-amber-800 flex-1">{error}</p>
                <button
                  type="button"
                  onClick={() => setDismissedError(error)}
                  className="p-0.5 rounded-md hover:bg-amber-200/50 transition-colors text-amber-600 shrink-0"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              {error.includes("ログイン") && (
                <Button variant="outline" size="sm" className="mt-2" asChild>
                  <Link href="/login">ログイン</Link>
                </Button>
              )}
            </CardContent>
          </Card>
        )}

        {/* Two Column Layout */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-4 gap-4 min-h-0">
          {/* Calendar - 3/4 width */}
          <div className="lg:col-span-3 flex flex-col min-h-0">
            <Card className="flex flex-col flex-1 min-h-0">
              <CardHeader className="pb-2 shrink-0">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Button variant="ghost" size="icon" onClick={prevMonth}>
                      <ChevronLeftIcon />
                    </Button>
                    <CardTitle className="text-lg">
                      {currentDate.getFullYear()}年 {currentDate.getMonth() + 1}月
                    </CardTitle>
                    <Button variant="ghost" size="icon" onClick={nextMonth}>
                      <ChevronRightIcon />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="flex min-h-0 flex-1 flex-col overflow-y-auto pb-mobile-tab">
                {isLoading ? (
                  <div className="flex flex-1 items-center justify-center">
                    <LoadingSpinner />
                  </div>
                ) : (
                  <div className="flex min-h-0 flex-col">
                    {/* Weekday headers（月グリッド内スクロール時も見えるよう固定） */}
                    <div className="sticky top-0 z-[1] mb-1 grid shrink-0 grid-cols-7 gap-1 border-b border-border/40 bg-card pb-1 pt-0.5">
                      {WEEKDAYS.map((day, i) => (
                        <div
                          key={day}
                          className={cn(
                            "py-2 text-center text-xs font-medium sm:text-sm",
                            i === 0 ? "text-red-500" : i === 6 ? "text-blue-500" : "text-muted-foreground"
                          )}
                        >
                          {day}
                        </div>
                      ))}
                    </div>

                    {/* 週の行は最低高さを確保し、はみ出しはカード内スクロール */}
                    <div className="grid auto-rows-[minmax(4rem,auto)] grid-cols-7 gap-1 sm:auto-rows-[minmax(4.5rem,auto)]">
                      {calendarDays.map((day, index) => {
                        const isCurrentMonth = day.getMonth() === currentDate.getMonth();
                        const dateKey = getLocalDateKey(day);
                        const isToday = dateKey === todayKey;
                        const dayEvents = eventsByDate.get(dateKey) || [];
                        const dayOfWeek = day.getDay();

                        return (
                          <div
                            key={index}
                            role="button"
                            tabIndex={0}
                            onClick={() => handleDayClick(day)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                handleDayClick(day);
                              }
                            }}
                            className={cn(
                              "p-1 rounded-lg border transition-colors text-left overflow-hidden cursor-pointer",
                              isCurrentMonth ? "bg-background" : "bg-muted/30",
                              isToday && "ring-2 ring-primary",
                              "hover:bg-muted/50"
                            )}
                          >
                            <span
                              className={cn(
                                "inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px] sm:h-6 sm:w-6 sm:text-sm",
                                !isCurrentMonth && "text-muted-foreground",
                                isToday && "bg-primary text-primary-foreground",
                                dayOfWeek === 0 && isCurrentMonth && !isToday && "text-red-500",
                                dayOfWeek === 6 && isCurrentMonth && !isToday && "text-blue-500"
                              )}
                            >
                              {day.getDate()}
                            </span>
                            <div className="mt-1 space-y-0.5">
                              {dayEvents.slice(0, 2).map((event, i) => {
                                const isDeadline = "eventType" in event && event.eventType === "deadline";
                                const isGoogle = "type" in event && event.type === "google";
                                const isCompleted = isDeadline && "completedAt" in event && !!event.completedAt;
                                return (
                                  <button
                                    key={i}
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setSelectedEvent(event);
                                      setShowDetailModal(true);
                                    }}
                                    className={cn(
                                      "w-full truncate rounded px-1 py-0.5 text-left text-[10px] cursor-pointer sm:text-xs",
                                      "hover:opacity-80 transition-opacity",
                                      isDeadline
                                        ? "bg-red-100 text-red-700"
                                        : isGoogle
                                        ? "bg-green-100 text-green-700"
                                        : "bg-blue-100 text-blue-700",
                                      isCompleted && "opacity-50 line-through"
                                    )}
                                  >
                                    {"title" in event ? event.title : event.summary}
                                  </button>
                                );
                              })}
                              {dayEvents.length > 2 && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setDayDetailDate(day);
                                    setDayDetailEvents(dayEvents);
                                  }}
                                  className="text-xs text-primary hover:underline px-1 cursor-pointer"
                                >
                                  +{dayEvents.length - 2}件
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Legend */}
            <div className="mt-2 flex shrink-0 flex-wrap items-center gap-3 text-xs text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded bg-red-100" />
                <span>締切</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded bg-blue-100" />
                <span>タスク</span>
              </div>
              {isGoogleConnected && (
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded bg-green-100" />
                  <span>Google予定</span>
                </div>
              )}
            </div>
          </div>

          {/* Sidebar - 1/4 width (desktop) */}
          <div className="hidden lg:flex lg:flex-col min-h-0 overflow-y-auto">
            <CalendarSidebar
              deadlines={deadlines}
              events={events}
              googleEvents={googleEvents}
              selectedDate={selectedDate}
              isGoogleConnected={isGoogleConnected}
              needsReconnect={connectionStatus?.needsReconnect}
              connectedEmail={connectionStatus?.connectedEmail}
            />
          </div>
        </div>

        {/* Mobile sidebar trigger */}
        <div className="lg:hidden shrink-0 mt-2">
          <Sheet open={showMobileSidebar} onOpenChange={setShowMobileSidebar}>
            <SheetTrigger asChild>
              <button
                type="button"
                className="w-full flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center gap-3 text-sm">
                  <span className="text-muted-foreground">今週の締切</span>
                  {(() => {
                    const weekEnd = new Date();
                    weekEnd.setDate(weekEnd.getDate() + 7);
                    const urgentCount = deadlines.filter((d) => {
                      if (d.completedAt) return false;
                      const due = new Date(d.dueDate);
                      return due >= new Date(new Date().setHours(0,0,0,0)) && due <= weekEnd;
                    }).length;
                    return urgentCount > 0 ? (
                      <Badge variant="destructive" className="text-xs">{urgentCount}件</Badge>
                    ) : (
                      <Badge variant="secondary" className="text-xs">0件</Badge>
                    );
                  })()}
                </div>
                <svg className="w-4 h-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                </svg>
              </button>
            </SheetTrigger>
            <SheetContent
              side="bottom"
              className="max-h-[80vh] overflow-y-auto pb-4"
            >
              <SheetHeader>
                <SheetTitle>カレンダー情報</SheetTitle>
              </SheetHeader>
              <div className="mt-4">
                <CalendarSidebar
                  deadlines={deadlines}
                  events={events}
                  googleEvents={googleEvents}
                  selectedDate={selectedDate}
                  isGoogleConnected={isGoogleConnected}
                  needsReconnect={connectionStatus?.needsReconnect}
                  connectedEmail={connectionStatus?.connectedEmail}
                />
              </div>
            </SheetContent>
          </Sheet>
        </div>

        {/* Floating Action Button for Task Suggestions */}
        <WorkBlockFAB
          onClick={() => handleSuggestWorkBlocks(new Date())}
          isVisible={isGoogleConnected}
        />

        {/* Add event modal */}
        <AddEventModal
          isOpen={showAddModal}
          selectedDate={selectedDate}
          onClose={() => {
            setShowAddModal(false);
            setSelectedDate(null);
          }}
          onCreate={handleCreateEvent}
        />

        {/* Work block suggestions modal */}
        <WorkBlockSuggestionsModal
          isOpen={showSuggestionsModal}
          selectedDate={selectedDate}
          suggestions={workBlockSuggestions}
          isLoading={isGoogleLoading}
          onClose={() => {
            setShowSuggestionsModal(false);
            setSelectedDate(null);
            setWorkBlockSuggestions([]);
          }}
          onCreateFromSuggestion={handleCreateFromSuggestion}
        />

        {/* Event detail modal */}
        <EventDetailModal
          isOpen={showDetailModal}
          event={selectedEvent}
          onClose={() => {
            setShowDetailModal(false);
            setSelectedEvent(null);
          }}
          onDelete={async (eventId) => {
            const result = await deleteEvent(eventId);
            notifyCalendarEventDeleted();
            notifyCalendarSyncResult(result.calendarSync);
            setShowDetailModal(false);
            setSelectedEvent(null);
          }}
        />

        {/* Day detail modal (for "+N more" overflow) */}
        {dayDetailDate && dayDetailEvents.length > 0 && (
          <div
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
            onClick={() => { setDayDetailDate(null); setDayDetailEvents([]); }}
          >
            <Card className="w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">
                    {dayDetailDate.toLocaleDateString("ja-JP", {
                      month: "long",
                      day: "numeric",
                      weekday: "short",
                    })}
                  </CardTitle>
                  <button
                    type="button"
                    onClick={() => { setDayDetailDate(null); setDayDetailEvents([]); }}
                    className="p-1 rounded-md hover:bg-muted transition-colors"
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </CardHeader>
              <CardContent className="space-y-1.5 max-h-64 overflow-y-auto">
                {dayDetailEvents.map((event, i) => {
                  const isDeadline = "eventType" in event && event.eventType === "deadline";
                  const isGoogle = "type" in event && event.type === "google";
                  const isCompleted = isDeadline && "completedAt" in event && !!event.completedAt;
                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() => {
                        setSelectedEvent(event);
                        setShowDetailModal(true);
                        setDayDetailDate(null);
                        setDayDetailEvents([]);
                      }}
                      className={cn(
                        "w-full text-left text-sm px-3 py-2 rounded-lg cursor-pointer",
                        "hover:opacity-80 transition-opacity",
                        isDeadline
                          ? "bg-red-100 text-red-700"
                          : isGoogle
                          ? "bg-green-100 text-green-700"
                          : "bg-blue-100 text-blue-700",
                        isCompleted && "opacity-50 line-through"
                      )}
                    >
                      {"title" in event ? event.title : event.summary}
                    </button>
                  );
                })}
              </CardContent>
            </Card>
          </div>
        )}
      </main>
    </div>
  );
}
