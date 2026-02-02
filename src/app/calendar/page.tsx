"use client";

import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import { DashboardHeader } from "@/components/dashboard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { useCalendarEvents, CalendarEvent, DeadlineEvent, useGoogleCalendar, GoogleCalendarEvent, WorkBlockSuggestion } from "@/hooks/useCalendar";
import { CalendarSidebar } from "@/components/calendar/CalendarSidebar";
import { WorkBlockFAB } from "@/components/calendar/WorkBlockFAB";

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

const PlusIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
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

const GoogleIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24">
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
  </svg>
);

const LightbulbIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
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

interface WorkBlockSuggestionsModalProps {
  isOpen: boolean;
  selectedDate: Date | null;
  suggestions: WorkBlockSuggestion[];
  isLoading: boolean;
  onClose: () => void;
  onSelectSuggestion: (suggestion: WorkBlockSuggestion) => void;
  onCreateFromSuggestion: (suggestion: WorkBlockSuggestion) => Promise<void>;
}

function WorkBlockSuggestionsModal({
  isOpen,
  selectedDate,
  suggestions,
  isLoading,
  onClose,
  onSelectSuggestion,
  onCreateFromSuggestion,
}: WorkBlockSuggestionsModalProps) {
  const [isCreating, setIsCreating] = useState(false);

  const handleCreate = async (suggestion: WorkBlockSuggestion) => {
    setIsCreating(true);
    try {
      await onCreateFromSuggestion(suggestion);
      onClose();
    } catch (error) {
      console.error("Failed to create work block:", error);
    } finally {
      setIsCreating(false);
    }
  };

  if (!isOpen || !selectedDate) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>作業ブロック提案</CardTitle>
          <p className="text-sm text-muted-foreground">
            {selectedDate.toLocaleDateString("ja-JP", {
              year: "numeric",
              month: "long",
              day: "numeric",
              weekday: "short",
            })}
          </p>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <LoadingSpinner />
            </div>
          ) : suggestions.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground">この日は空き時間が見つかりませんでした</p>
            </div>
          ) : (
            <div className="space-y-3">
              {suggestions.map((suggestion, i) => {
                const startTime = new Date(suggestion.start).toLocaleTimeString("ja-JP", {
                  hour: "2-digit",
                  minute: "2-digit",
                });
                const endTime = new Date(suggestion.end).toLocaleTimeString("ja-JP", {
                  hour: "2-digit",
                  minute: "2-digit",
                });
                return (
                  <div key={i} className="p-4 border rounded-lg hover:bg-muted/50 transition-colors">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <p className="font-medium">{suggestion.title}</p>
                        <p className="text-sm text-muted-foreground mt-1">
                          {startTime} - {endTime}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        onClick={() => handleCreate(suggestion)}
                        disabled={isCreating}
                      >
                        {isCreating ? <LoadingSpinner /> : "追加"}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <div className="flex justify-end mt-6">
            <Button variant="outline" onClick={onClose}>
              閉じる
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !selectedDate) {
      setError("タイトルを入力してください");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const dateStr = selectedDate.toISOString().split("T")[0];
      await onCreate({
        type: "work_block",
        title: title.trim(),
        startAt: `${dateStr}T${startTime}:00`,
        endAt: `${dateStr}T${endTime}:00`,
      });
      setTitle("");
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "エラーが発生しました");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen || !selectedDate) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>作業ブロックを追加</CardTitle>
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

  const googleCalendar = useGoogleCalendar();

  // Fetch Google Calendar events when month changes
  useEffect(() => {
    if (googleCalendar.isConnected) {
      googleCalendar.fetchGoogleEvents(monthStart, monthEnd).then(setGoogleEvents);
    }
  }, [googleCalendar.isConnected, monthStart, monthEnd]);

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

  // Group events by date (including Google Calendar events)
  const eventsByDate = useMemo(() => {
    const map = new Map<string, (CalendarEvent | DeadlineEvent | { type: "google"; title: string })[]>();

    events.forEach((event) => {
      const dateKey = new Date(event.startAt).toISOString().split("T")[0];
      if (!map.has(dateKey)) {
        map.set(dateKey, []);
      }
      map.get(dateKey)!.push(event);
    });

    deadlines.forEach((deadline) => {
      const dateKey = new Date(deadline.dueDate).toISOString().split("T")[0];
      if (!map.has(dateKey)) {
        map.set(dateKey, []);
      }
      map.get(dateKey)!.push(deadline);
    });

    // Add Google Calendar events
    googleEvents.forEach((googleEvent) => {
      const startDateTime = googleEvent.start.dateTime || googleEvent.start.date;
      if (!startDateTime) return;
      const dateKey = new Date(startDateTime).toISOString().split("T")[0];
      if (!map.has(dateKey)) {
        map.set(dateKey, []);
      }
      map.get(dateKey)!.push({
        type: "google",
        title: googleEvent.summary,
      });
    });

    return map;
  }, [events, deadlines, googleEvents]);

  const prevMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  };

  const nextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  };

  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  const handleDayClick = (day: Date) => {
    setSelectedDate(day);
    setShowAddModal(true);
  };

  const handleSuggestWorkBlocks = async (day: Date) => {
    setSelectedDate(day);
    setShowSuggestionsModal(true);
    const dateStr = day.toISOString().split("T")[0];
    const suggestions = await googleCalendar.suggestWorkBlocks(dateStr);
    setWorkBlockSuggestions(suggestions);
  };

  const handleCreateFromSuggestion = async (suggestion: WorkBlockSuggestion) => {
    await createEvent({
      type: "work_block",
      title: suggestion.title,
      startAt: suggestion.start,
      endAt: suggestion.end,
    });
  };

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-background">
      <DashboardHeader />

      <main className="flex-1 overflow-hidden max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-4 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between mb-4 shrink-0">
          <div>
            <h1 className="text-2xl font-bold">カレンダー</h1>
            <p className="text-muted-foreground mt-1">締切と作業ブロックを管理</p>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" asChild>
              <Link href="/calendar/settings">
                <SettingsIcon />
                <span className="ml-1.5">設定</span>
              </Link>
            </Button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <Card className="mb-4 border-amber-200 bg-amber-50/50 shrink-0">
            <CardContent className="py-3">
              <p className="text-sm text-amber-800">{error}</p>
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
              <CardContent className="flex-1 flex flex-col min-h-0 overflow-hidden">
                {isLoading ? (
                  <div className="flex items-center justify-center flex-1">
                    <LoadingSpinner />
                  </div>
                ) : (
                  <div className="flex flex-col flex-1 min-h-0">
                    {/* Weekday headers */}
                    <div className="grid grid-cols-7 gap-1 mb-1 shrink-0">
                      {WEEKDAYS.map((day, i) => (
                        <div
                          key={day}
                          className={cn(
                            "text-center text-sm font-medium py-2",
                            i === 0 ? "text-red-500" : i === 6 ? "text-blue-500" : "text-muted-foreground"
                          )}
                        >
                          {day}
                        </div>
                      ))}
                    </div>

                    {/* Calendar grid */}
                    <div className="grid grid-cols-7 gap-1 flex-1 auto-rows-fr">
                      {calendarDays.map((day, index) => {
                        const isCurrentMonth = day.getMonth() === currentDate.getMonth();
                        const dateKey = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
                        const isToday = dateKey === todayKey;
                        const dayEvents = eventsByDate.get(dateKey) || [];
                        const dayOfWeek = day.getDay();

                        return (
                          <button
                            key={index}
                            onClick={() => handleDayClick(day)}
                            className={cn(
                              "p-1 rounded-lg border transition-colors text-left overflow-hidden",
                              isCurrentMonth ? "bg-background" : "bg-muted/30",
                              isToday && "ring-2 ring-primary",
                              "hover:bg-muted/50"
                            )}
                          >
                            <span
                              className={cn(
                                "inline-flex items-center justify-center w-6 h-6 rounded-full text-sm",
                                !isCurrentMonth && "text-muted-foreground",
                                isToday && "bg-primary text-primary-foreground",
                                dayOfWeek === 0 && isCurrentMonth && !isToday && "text-red-500",
                                dayOfWeek === 6 && isCurrentMonth && !isToday && "text-blue-500"
                              )}
                            >
                              {day.getDate()}
                            </span>
                            <div className="mt-1 space-y-0.5">
                              {dayEvents.slice(0, 3).map((event, i) => {
                                const isDeadline = "eventType" in event && event.eventType === "deadline";
                                const isGoogle = "type" in event && event.type === "google";
                                return (
                                  <div
                                    key={i}
                                    className={cn(
                                      "text-xs px-1 py-0.5 rounded truncate",
                                      isDeadline
                                        ? "bg-red-100 text-red-700"
                                        : isGoogle
                                        ? "bg-green-100 text-green-700"
                                        : "bg-blue-100 text-blue-700"
                                    )}
                                  >
                                    {event.title}
                                  </div>
                                );
                              })}
                              {dayEvents.length > 3 && (
                                <div className="text-xs text-muted-foreground px-1">
                                  +{dayEvents.length - 3}
                                </div>
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Legend */}
            <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground shrink-0">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded bg-red-100" />
                <span>締切</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded bg-blue-100" />
                <span>作業ブロック</span>
              </div>
              {googleCalendar.isConnected && (
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded bg-green-100" />
                  <span>Google予定</span>
                </div>
              )}
            </div>
          </div>

          {/* Sidebar - 1/4 width */}
          <div className="hidden lg:flex lg:flex-col min-h-0 overflow-y-auto">
            <CalendarSidebar
              deadlines={deadlines}
              events={events}
              googleEvents={googleEvents}
              selectedDate={selectedDate}
              isGoogleConnected={googleCalendar.isConnected}
            />
          </div>
        </div>

        {/* Floating Action Button for Work Block Suggestions */}
        <WorkBlockFAB
          onClick={() => {
            const today = new Date();
            handleSuggestWorkBlocks(today);
          }}
          isVisible={googleCalendar.isConnected}
        />

        {/* Add event modal */}
        <AddEventModal
          isOpen={showAddModal}
          selectedDate={selectedDate}
          onClose={() => {
            setShowAddModal(false);
            setSelectedDate(null);
          }}
          onCreate={createEvent}
        />

        {/* Work block suggestions modal */}
        <WorkBlockSuggestionsModal
          isOpen={showSuggestionsModal}
          selectedDate={selectedDate}
          suggestions={workBlockSuggestions}
          isLoading={googleCalendar.isLoading}
          onClose={() => {
            setShowSuggestionsModal(false);
            setSelectedDate(null);
            setWorkBlockSuggestions([]);
          }}
          onSelectSuggestion={(suggestion) => {
            console.log("Selected suggestion:", suggestion);
          }}
          onCreateFromSuggestion={handleCreateFromSuggestion}
        />
      </main>
    </div>
  );
}
