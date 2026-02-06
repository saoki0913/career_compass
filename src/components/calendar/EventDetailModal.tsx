"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { CalendarEvent, DeadlineEvent, GoogleCalendarEvent } from "@/hooks/useCalendar";

// Extended type for display purposes
export type DisplayEvent =
  | CalendarEvent
  | DeadlineEvent
  | (GoogleCalendarEvent & { type: "google" });

// Icons
const TaskIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
    />
  </svg>
);

const DeadlineIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
    />
  </svg>
);

const GoogleIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
  </svg>
);

const CloseIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
  </svg>
);

const TrashIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
    />
  </svg>
);

const ExternalLinkIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
    />
  </svg>
);

interface EventDetailModalProps {
  isOpen: boolean;
  event: DisplayEvent | null;
  onClose: () => void;
  onDelete?: (eventId: string) => Promise<void>;
}

function isDeadlineEvent(event: DisplayEvent): event is DeadlineEvent {
  return "eventType" in event && event.eventType === "deadline";
}

function isGoogleEvent(event: DisplayEvent): event is GoogleCalendarEvent & { type: "google" } {
  return "type" in event && event.type === "google";
}

function isCalendarEvent(event: DisplayEvent): event is CalendarEvent {
  return "type" in event && event.type === "work_block";
}

export function EventDetailModal({ isOpen, event, onClose, onDelete }: EventDetailModalProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Reset states when event changes
  useEffect(() => {
    setShowDeleteConfirm(false);
    setDeleteError(null);
    setIsDeleting(false);
  }, [event]);

  // Escape key to close
  useEffect(() => {
    if (!isOpen) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isOpen, onClose]);

  if (!isOpen || !event) return null;

  const handleDelete = async () => {
    if (!onDelete || !("id" in event) || isGoogleEvent(event)) return;

    setIsDeleting(true);
    setDeleteError(null);
    try {
      await onDelete(event.id);
      onClose();
    } catch (error) {
      console.error("Failed to delete event:", error);
      setDeleteError("削除に失敗しました");
    } finally {
      setIsDeleting(false);
    }
  };

  // Format date/time for display
  const formatDateTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return {
      date: date.toLocaleDateString("ja-JP", {
        year: "numeric",
        month: "long",
        day: "numeric",
        weekday: "short",
      }),
      time: date.toLocaleTimeString("ja-JP", {
        hour: "2-digit",
        minute: "2-digit",
      }),
    };
  };

  // Get days left for deadline
  const getDaysLeft = (dueDate: string) => {
    const due = new Date(dueDate);
    const now = new Date();
    const diff = due.getTime() - now.getTime();
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
    return days;
  };

  // Render content based on event type
  const renderContent = () => {
    if (isDeadlineEvent(event)) {
      const daysLeft = getDaysLeft(event.dueDate);
      const { date } = formatDateTime(event.dueDate);

      return (
        <>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-red-600">
                <DeadlineIcon />
                <span className="text-sm font-medium">締切</span>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="p-1 rounded-md hover:bg-muted transition-colors"
              >
                <CloseIcon />
              </button>
            </div>
            <CardTitle className="text-lg mt-2">{event.title}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2 text-sm">
              {event.companyName && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">企業</span>
                  <span className="font-medium">{event.companyName}</span>
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">締切日</span>
                <span className="font-medium">{date}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">残り</span>
                <span
                  className={cn(
                    "font-medium",
                    daysLeft <= 1 && "text-red-600",
                    daysLeft > 1 && daysLeft <= 3 && "text-orange-600",
                    daysLeft > 3 && daysLeft <= 7 && "text-amber-600"
                  )}
                >
                  {daysLeft <= 0 ? "期限切れ" : `あと${daysLeft}日`}
                </span>
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              {event.companyId && (
                <Button variant="outline" size="sm" asChild className="flex-1">
                  <Link href={`/companies/${event.companyId}`}>
                    企業を見る
                    <ExternalLinkIcon />
                  </Link>
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={onClose} className="flex-1">
                閉じる
              </Button>
            </div>
          </CardContent>
        </>
      );
    }

    if (isGoogleEvent(event)) {
      const startDateTime = event.start.dateTime || event.start.date || "";
      const endDateTime = event.end.dateTime || event.end.date || "";
      const start = formatDateTime(startDateTime);
      const end = formatDateTime(endDateTime);
      const isAllDay = !event.start.dateTime;

      return (
        <>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-green-600">
                <GoogleIcon />
                <span className="text-sm font-medium">Google予定</span>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="p-1 rounded-md hover:bg-muted transition-colors"
              >
                <CloseIcon />
              </button>
            </div>
            <CardTitle className="text-lg mt-2">{event.summary}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">日付</span>
                <span className="font-medium">{start.date}</span>
              </div>
              {!isAllDay && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">時間</span>
                  <span className="font-medium">
                    {start.time} - {end.time}
                  </span>
                </div>
              )}
              {isAllDay && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">時間</span>
                  <span className="font-medium">終日</span>
                </div>
              )}
            </div>

            <div className="flex gap-2 pt-2">
              {event.htmlLink && (
                <Button variant="outline" size="sm" asChild className="flex-1">
                  <a href={event.htmlLink} target="_blank" rel="noopener noreferrer">
                    Googleカレンダーで開く
                    <ExternalLinkIcon />
                  </a>
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={onClose} className="flex-1">
                閉じる
              </Button>
            </div>
          </CardContent>
        </>
      );
    }

    if (isCalendarEvent(event)) {
      const start = formatDateTime(event.startAt);
      const end = formatDateTime(event.endAt);

      return (
        <>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-blue-600">
                <TaskIcon />
                <span className="text-sm font-medium">タスク</span>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="p-1 rounded-md hover:bg-muted transition-colors"
              >
                <CloseIcon />
              </button>
            </div>
            <CardTitle className="text-lg mt-2">{event.title}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">日付</span>
                <span className="font-medium">{start.date}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">時間</span>
                <span className="font-medium">
                  {start.time} - {end.time}
                </span>
              </div>
            </div>

            {deleteError && (
              <div className="p-2 rounded-lg bg-red-50 border border-red-200">
                <p className="text-xs text-red-800">{deleteError}</p>
              </div>
            )}

            <div className="flex gap-2 pt-2">
              {onDelete && !showDeleteConfirm && (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setShowDeleteConfirm(true)}
                  className="flex-1"
                >
                  <TrashIcon />
                  削除
                </Button>
              )}
              {onDelete && showDeleteConfirm && (
                <>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={handleDelete}
                    disabled={isDeleting}
                    className="flex-1"
                  >
                    {isDeleting ? "削除中..." : "本当に削除"}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowDeleteConfirm(false)}
                    disabled={isDeleting}
                    className="flex-1"
                  >
                    やめる
                  </Button>
                </>
              )}
              {!showDeleteConfirm && (
                <Button variant="outline" size="sm" onClick={onClose} className="flex-1">
                  閉じる
                </Button>
              )}
            </div>
          </CardContent>
        </>
      );
    }

    return null;
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <Card className="w-full max-w-sm" onClick={(e) => e.stopPropagation()}>{renderContent()}</Card>
    </div>
  );
}

export default EventDetailModal;
