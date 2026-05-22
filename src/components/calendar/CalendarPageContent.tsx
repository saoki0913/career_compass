"use client";

import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn, getLocalDateKey } from "@/lib/utils";
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
  notifyError,
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

const GoogleMiniIcon = () => (
  <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
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

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

function notifyCalendarSyncResult(calendarSync?: { status?: string }) {
  if (calendarSync?.status === "synced") {
    notifyCalendarSynced();
  } else if (calendarSync?.status === "failed") {
    notifyCalendarSyncFailed();
  }
}

function getEventTitle(event: DisplayEvent) {
  return "title" in event ? event.title : event.summary;
}

function getEventKind(event: DisplayEvent) {
  if ("eventType" in event && event.eventType === "deadline") return "締切";
  if ("type" in event && event.type === "google") return "Google予定";
  return "タスク";
}

function getEventChipClassName(event: DisplayEvent) {
  if ("eventType" in event && event.eventType === "deadline") {
    return "bg-red-100 text-red-700 ring-red-200";
  }
  if ("type" in event && event.type === "google") {
    return "bg-emerald-100 text-emerald-700 ring-emerald-200";
  }
  return "bg-blue-100 text-blue-700 ring-blue-200";
}

interface GoogleCalendarConnectionStripProps {
  isGoogleConnected: boolean;
  needsReconnect?: boolean;
  connectedEmail?: string | null;
  className?: string;
}

function GoogleCalendarConnectionStrip({
  isGoogleConnected,
  needsReconnect = false,
  connectedEmail,
  className,
}: GoogleCalendarConnectionStripProps) {
  const label = needsReconnect ? "Google再連携が必要" : isGoogleConnected ? "Google連携中" : "Google未連携";
  const action = needsReconnect ? "再連携" : "設定";

  return (
    <Link
      href="/calendar/settings"
      aria-label={`${label}。設定画面を開く`}
      className={cn(
        "flex min-h-10 items-center gap-2 rounded-2xl border px-3 py-2 text-xs shadow-sm transition-colors sm:min-h-11 sm:px-4 sm:text-sm",
        needsReconnect
          ? "border-amber-300 bg-amber-50/90 text-amber-800 hover:bg-amber-100"
          : isGoogleConnected
            ? "border-emerald-200 bg-emerald-50/80 text-emerald-800 hover:bg-emerald-100"
            : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
        className,
      )}
    >
      <GoogleMiniIcon />
      <span className="min-w-0 flex-1 truncate font-semibold">
        {label}
        {connectedEmail && isGoogleConnected && !needsReconnect && (
          <span className="hidden font-normal text-slate-500 sm:inline"> ・ {connectedEmail}</span>
        )}
      </span>
      <span
        className={cn(
          "shrink-0 rounded-full px-2 py-1 text-[11px] font-semibold",
          needsReconnect ? "bg-amber-200/70 text-amber-900" : "bg-white/80 text-slate-700",
        )}
      >
        {action}
      </span>
    </Link>
  );
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
      const ui = toAppUiError(
        err,
        {
          code: "CALENDAR_EVENT_SUBMIT_FAILED",
          userMessage: "イベントを保存できませんでした。",
        },
        "CalendarPage:submitEvent",
      );
      notifyError({ title: ui.message, description: ui.action });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen || !selectedDate) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="calendar-add-event-title"
      onClick={onClose}
    >
      <Card className="max-h-[min(80vh,42rem)] w-full max-w-md overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <CardHeader>
          <CardTitle id="calendar-add-event-title">タスクを追加</CardTitle>
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

export default function CalendarPageContent() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [focusedDate, setFocusedDate] = useState<Date | null>(new Date());
  const [addEventDate, setAddEventDate] = useState<Date | null>(null);
  const [suggestionDate, setSuggestionDate] = useState<Date | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showSuggestionsModal, setShowSuggestionsModal] = useState(false);
  const [googleEvents, setGoogleEvents] = useState<GoogleCalendarEvent[]>([]);
  const [workBlockSuggestions, setWorkBlockSuggestions] = useState<WorkBlockSuggestion[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<DisplayEvent | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [dayDetailDate, setDayDetailDate] = useState<Date | null>(null);
  const [dayDetailEvents, setDayDetailEvents] = useState<DisplayEvent[]>([]);
  const [dismissedError, setDismissedError] = useState<string | null>(null);

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
  const canUseGoogleCalendar = isGoogleConnected && !connectionStatus?.needsReconnect;

  // Fetch Google Calendar events when month changes.
  // Do not depend on the whole hook return object — it is a new reference every render, and
  // fetchGoogleEvents toggles loading state which would retrigger this effect infinitely.
  useEffect(() => {
    if (!canUseGoogleCalendar) {
      setGoogleEvents([]);
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
  }, [canUseGoogleCalendar, fetchGoogleEvents, monthStart, monthEnd]);

  const effectiveGoogleEvents = useMemo(
    () => (canUseGoogleCalendar ? googleEvents : []),
    [canUseGoogleCalendar, googleEvents],
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

    // Add days from next month; keep the visual grid stable across months.
    while (days.length < 42) {
      days.push(new Date(year, month + 1, days.length - firstDay.getDay() - lastDay.getDate() + 1));
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
    const nextDate = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1);
    setCurrentDate(nextDate);
    setFocusedDate(nextDate);
  };

  const nextMonth = () => {
    const nextDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1);
    setCurrentDate(nextDate);
    setFocusedDate(nextDate);
  };

  const today = new Date();
  const todayKey = getLocalDateKey(today);
  const focusedDateKey = focusedDate ? getLocalDateKey(focusedDate) : todayKey;
  const focusedDateEvents = eventsByDate.get(focusedDateKey) || [];

  const handleDayClick = (day: Date) => {
    setFocusedDate(day);
    setAddEventDate(day);
    setShowAddModal(true);
  };

  const handleSuggestWorkBlocks = async (day: Date) => {
    setSuggestionDate(day);
    setShowSuggestionsModal(true);
    const dateStr = getLocalDateKey(day);
    try {
      const suggestions = await suggestWorkBlocks(dateStr);
      setWorkBlockSuggestions(suggestions);
    } catch (error) {
      setShowSuggestionsModal(false);
      setSuggestionDate(null);
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
    <div className="min-h-dvh bg-slate-50/80 text-slate-950">
      <main className="mx-auto flex w-full max-w-[96rem] flex-col gap-4 px-4 py-4 pb-mobile-tab sm:gap-5 sm:px-6 sm:py-5 md:px-7 lg:h-dvh lg:overflow-hidden lg:px-8 lg:py-7">
        {/* Header */}
        <div className="flex shrink-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
          <div className="order-2 min-w-0 sm:order-1 sm:pl-14 lg:pl-0">
            <p className="mb-2 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/90 px-3 py-1 text-xs font-semibold text-slate-500 shadow-sm sm:mb-3 sm:px-4 sm:py-1.5">
              スケジュール
            </p>
            <h1 className="text-3xl font-bold tracking-normal text-slate-950 sm:text-5xl lg:text-4xl">
              カレンダー
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600 sm:mt-3 sm:text-base sm:leading-7 lg:text-sm">
              締切と作業ブロックを月単位で確認し、Google カレンダー連携の状態もここで管理します。
            </p>
          </div>
          <div className="order-1 flex w-full min-w-0 flex-wrap items-center gap-2 pl-14 sm:order-2 sm:w-auto sm:justify-end sm:gap-3 sm:pl-0">
            <Button variant="ghost" asChild className="h-11 shrink-0 rounded-2xl px-4 text-slate-600 hover:bg-white">
              <Link href="/dashboard">
                <span className="sm:hidden">ホーム</span>
                <span className="hidden sm:inline">ホームに戻る</span>
              </Link>
            </Button>
            <Button variant="outline" asChild className="h-11 shrink-0 rounded-2xl border-slate-200 bg-white px-4 shadow-sm">
              <Link href="/calendar/settings">
                <SettingsIcon />
                <span className="ml-1.5">{connectionStatus?.needsReconnect ? "再連携" : "設定"}</span>
              </Link>
            </Button>
          </div>
        </div>

        {/* Error */}
        {error && dismissedError !== error && (
          <Card className="shrink-0 rounded-[22px] border-amber-200 bg-amber-50/80">
            <CardContent className="py-3">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm text-amber-800 flex-1">{error}</p>
                <button
                  type="button"
                  aria-label="エラー通知を閉じる"
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

        <GoogleCalendarConnectionStrip
          className="lg:hidden"
          isGoogleConnected={isGoogleConnected}
          needsReconnect={connectionStatus?.needsReconnect}
          connectedEmail={connectionStatus?.connectedEmail}
        />

        {/* Responsive Layout */}
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_20rem] xl:grid-cols-[minmax(0,1fr)_24rem]">
          {/* Calendar - 3/4 width */}
          <div className="flex min-h-0 flex-col">
            <Card className="flex min-h-0 flex-col rounded-[28px] border border-slate-200 bg-white shadow-[0_18px_48px_rgba(15,23,42,0.08)]">
              <CardHeader className="shrink-0 px-4 pb-2 pt-4 sm:px-8 sm:pb-3 sm:pt-6 lg:px-8">
                <div className="flex items-center justify-center">
                  <div className="flex items-center gap-4 sm:gap-8">
                    <Button variant="ghost" size="icon" onClick={prevMonth} aria-label="前の月を表示" className="h-10 w-10 rounded-full text-slate-600 sm:h-11 sm:w-11">
                      <ChevronLeftIcon />
                    </Button>
                    <CardTitle className="min-w-32 text-center text-xl font-bold text-slate-950 sm:text-3xl lg:text-2xl">
                      {currentDate.getFullYear()}年 {currentDate.getMonth() + 1}月
                    </CardTitle>
                    <Button variant="ghost" size="icon" onClick={nextMonth} aria-label="次の月を表示" className="h-10 w-10 rounded-full text-slate-600 sm:h-11 sm:w-11">
                      <ChevronRightIcon />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="flex min-h-0 flex-1 flex-col px-3 pb-4 sm:px-8 sm:pb-5 lg:overflow-y-auto">
                {isLoading ? (
                  <div className="flex min-h-[28rem] flex-1 items-center justify-center">
                    <LoadingSpinner />
                  </div>
                ) : (
                  <div className="flex min-h-0 flex-col">
                    <div className="grid shrink-0 grid-cols-7 gap-1 pb-3 sm:gap-2">
                      {WEEKDAYS.map((day, i) => (
                        <div
                          key={day}
                          className={cn(
                            "py-2 text-center text-sm font-semibold",
                            i === 0 ? "text-red-500" : i === 6 ? "text-blue-500" : "text-slate-500"
                          )}
                        >
                          {day}
                        </div>
                      ))}
                    </div>

                    <div className="grid grid-cols-7 auto-rows-[minmax(5.5rem,auto)] gap-1.5 sm:auto-rows-[minmax(5.8rem,auto)] sm:gap-2 md:auto-rows-[minmax(6.4rem,auto)] lg:auto-rows-[minmax(5.8rem,1fr)] xl:auto-rows-[minmax(6.4rem,1fr)]">
                      {calendarDays.map((day, index) => {
                        const isCurrentMonth = day.getMonth() === currentDate.getMonth();
                        const dateKey = getLocalDateKey(day);
                        const isToday = dateKey === todayKey;
                        const isFocused = dateKey === focusedDateKey;
                        const dayEvents = eventsByDate.get(dateKey) || [];
                        const dayOfWeek = day.getDay();
                        const dateLabel = day.toLocaleDateString("ja-JP", {
                          year: "numeric",
                          month: "long",
                          day: "numeric",
                          weekday: "short",
                        });

                        return (
                          <div
                            key={index}
                            className="relative min-h-[5.5rem] overflow-hidden rounded-xl sm:min-h-24 sm:rounded-2xl md:min-h-[6.4rem] lg:min-h-0"
                          >
                            <button
                              type="button"
                              onClick={() => handleDayClick(day)}
                              aria-label={`${dateLabel}に予定を追加`}
                              title={`${dateLabel}に予定を追加`}
                              className="absolute inset-0 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2 sm:rounded-2xl"
                            />
                            <div
                              aria-hidden="true"
                              className={cn(
                                "pointer-events-none absolute inset-0 rounded-xl border transition-colors sm:rounded-2xl",
                                isCurrentMonth ? "border-slate-200 bg-white" : "border-slate-100 bg-slate-50/80",
                                isFocused && "border-sky-400 bg-sky-50/40 ring-1 ring-sky-300",
                                isToday && "border-sky-500 ring-2 ring-sky-500",
                              )}
                            />
                            <div
                              className={cn(
                                "pointer-events-none relative z-[1] flex h-full min-h-14 flex-col overflow-hidden p-1 text-left sm:min-h-24 sm:p-2 md:min-h-0",
                              )}
                            >
                              <span
                                className={cn(
                                  "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-sm font-semibold sm:h-7 sm:w-7 sm:text-base",
                                  !isCurrentMonth && "text-slate-400",
                                  isToday && "bg-sky-600 text-white shadow-sm",
                                  dayOfWeek === 0 && isCurrentMonth && !isToday && "text-red-500",
                                  dayOfWeek === 6 && isCurrentMonth && !isToday && "text-blue-500",
                                  dayOfWeek !== 0 && dayOfWeek !== 6 && isCurrentMonth && !isToday && "text-slate-950",
                                )}
                              >
                                {day.getDate()}
                              </span>
                              <div className="mt-1 space-y-1 overflow-hidden">
                                {dayEvents.slice(0, 2).map((event, i) => {
                                  const isDeadline = "eventType" in event && event.eventType === "deadline";
                                  const isCompleted = isDeadline && "completedAt" in event && !!event.completedAt;
                                  return (
                                    <button
                                      key={i}
                                      type="button"
                                      aria-label={`${getEventKind(event)}: ${getEventTitle(event)}の詳細を表示`}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setSelectedEvent(event);
                                        setShowDetailModal(true);
                                      }}
                                      className={cn(
                                        "pointer-events-auto flex h-6 w-full cursor-pointer items-center truncate rounded px-0.5 text-left text-[8px] font-semibold leading-4 ring-1 transition-opacity hover:opacity-80 sm:h-5 sm:rounded-md sm:px-1.5 sm:text-[11px] sm:leading-5",
                                        getEventChipClassName(event),
                                        isCompleted && "opacity-50 line-through"
                                      )}
                                    >
                                      {getEventTitle(event)}
                                    </button>
                                  );
                                })}
                                {dayEvents.length > 2 && (
                                  <button
                                    type="button"
                                    aria-label={`${dateLabel}の予定一覧を表示`}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setFocusedDate(day);
                                      setDayDetailDate(day);
                                      setDayDetailEvents(dayEvents);
                                    }}
                                    className={cn(
                                      "pointer-events-auto truncate text-left text-[10px] font-semibold leading-4 text-sky-600 hover:underline sm:px-1 sm:text-xs"
                                    )}
                                  >
                                    +{dayEvents.length - 2}件
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </CardContent>
              <div className="flex shrink-0 flex-wrap items-center gap-5 px-5 pb-5 text-sm text-slate-500 sm:px-8">
                <div className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full bg-red-100 ring-1 ring-red-200" />
                  <span>締切</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full bg-blue-100 ring-1 ring-blue-200" />
                  <span>タスク</span>
                </div>
                {canUseGoogleCalendar && (
                  <div className="flex items-center gap-2">
                    <span className="h-3 w-3 rounded-full bg-emerald-100 ring-1 ring-emerald-200" />
                    <span>Google予定</span>
                  </div>
                )}
              </div>
            </Card>
          </div>

          {/* Sidebar - desktop */}
          <div className="hidden min-h-0 overflow-y-auto lg:block">
            <CalendarSidebar
              deadlines={deadlines}
              events={events}
              googleEvents={effectiveGoogleEvents}
              selectedDate={focusedDate}
              selectedDateDisplayEvents={focusedDateEvents}
              isGoogleConnected={isGoogleConnected}
              needsReconnect={connectionStatus?.needsReconnect}
              connectedEmail={connectionStatus?.connectedEmail}
              showMonthSummary={false}
            />
          </div>
        </div>

        <div className="md:hidden">
          <CalendarSidebar
            deadlines={deadlines}
            events={events}
            googleEvents={effectiveGoogleEvents}
            selectedDate={focusedDate}
            selectedDateDisplayEvents={focusedDateEvents}
            isGoogleConnected={isGoogleConnected}
            needsReconnect={connectionStatus?.needsReconnect}
            connectedEmail={connectionStatus?.connectedEmail}
            showConnectionStatus={false}
            showSelectedDateCard={false}
            showMonthSummary
          />
        </div>

        <div className="hidden md:block lg:hidden">
          <CalendarSidebar
            deadlines={deadlines}
            events={events}
            googleEvents={effectiveGoogleEvents}
            selectedDate={focusedDate}
            selectedDateDisplayEvents={focusedDateEvents}
            isGoogleConnected={isGoogleConnected}
            needsReconnect={connectionStatus?.needsReconnect}
            connectedEmail={connectionStatus?.connectedEmail}
            showConnectionStatus={false}
            showOverviewCards={false}
            showSelectedDateCard={false}
            showMonthSummary
          />
        </div>

        {/* Floating Action Button for Task Suggestions */}
        <WorkBlockFAB
          onClick={() => handleSuggestWorkBlocks(new Date())}
          isVisible={canUseGoogleCalendar}
          className="max-lg:bottom-[calc(1rem+env(safe-area-inset-bottom))]"
        />

        {/* Add event modal */}
        <AddEventModal
          isOpen={showAddModal}
          selectedDate={addEventDate}
          onClose={() => {
            setShowAddModal(false);
            setAddEventDate(null);
          }}
          onCreate={handleCreateEvent}
        />

        {/* Work block suggestions modal */}
        <WorkBlockSuggestionsModal
          isOpen={showSuggestionsModal}
          selectedDate={suggestionDate}
          suggestions={workBlockSuggestions}
          isLoading={isGoogleLoading}
          onClose={() => {
            setShowSuggestionsModal(false);
            setSuggestionDate(null);
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
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="calendar-day-detail-title"
            onClick={() => { setDayDetailDate(null); setDayDetailEvents([]); }}
          >
            <Card className="w-full max-w-sm rounded-[22px]" onClick={(e) => e.stopPropagation()}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle id="calendar-day-detail-title" className="text-base">
                    {dayDetailDate.toLocaleDateString("ja-JP", {
                      month: "long",
                      day: "numeric",
                      weekday: "short",
                    })}
                  </CardTitle>
                  <button
                    type="button"
                    aria-label="日別詳細を閉じる"
                    onClick={() => { setDayDetailDate(null); setDayDetailEvents([]); }}
                    className="rounded-md p-1 transition-colors hover:bg-muted"
                  >
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </CardHeader>
              <CardContent className="max-h-64 space-y-1.5 overflow-y-auto">
                {dayDetailEvents.map((event, i) => {
                  const isDeadline = "eventType" in event && event.eventType === "deadline";
                  const isCompleted = isDeadline && "completedAt" in event && !!event.completedAt;
                  return (
                    <button
                      key={i}
                      type="button"
                      aria-label={`${getEventKind(event)}: ${getEventTitle(event)}の詳細を表示`}
                      onClick={() => {
                        setSelectedEvent(event);
                        setShowDetailModal(true);
                        setDayDetailDate(null);
                        setDayDetailEvents([]);
                      }}
                      className={cn(
                        "w-full cursor-pointer rounded-lg px-3 py-2 text-left text-sm ring-1 transition-opacity hover:opacity-80",
                        getEventChipClassName(event),
                        isCompleted && "opacity-50 line-through"
                      )}
                    >
                      {getEventTitle(event)}
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
