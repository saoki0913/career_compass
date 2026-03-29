"use client";

import { useState, useEffect, useCallback } from "react";
import { parseApiErrorResponse, toAppUiError } from "@/lib/api-errors";

export interface CalendarEvent {
  id: string;
  userId: string;
  deadlineId: string | null;
  googleCalendarId: string | null;
  googleEventId: string | null;
  googleSyncStatus: "idle" | "pending" | "synced" | "failed" | "suppressed";
  googleSyncError: string | null;
  googleSyncedAt: string | null;
  type: "deadline" | "work_block";
  title: string;
  startAt: string;
  endAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface DeadlineEvent {
  id: string;
  title: string;
  type: string;
  dueDate: string;
  companyId: string;
  companyName: string | null;
  isConfirmed: boolean;
  completedAt: string | null;
  googleSyncStatus: "idle" | "pending" | "synced" | "failed" | "suppressed";
  googleSyncError: string | null;
  eventType: "deadline";
}

export interface CalendarSettings {
  provider: "google" | "app";
  targetCalendarId: string | null;
  freebusyCalendarIds: string[];
  preferredTimeSlots: {
    start: string;
    end: string;
  } | null;
  connectionStatus: {
    connected: boolean;
    needsReconnect: boolean;
    connectedEmail: string | null;
    connectedAt: string | null;
    grantedScopes: string[];
    missingScopes: string[];
  };
  syncSummary: {
    pendingCount: number;
    failedCount: number;
    lastFailureReason: string | null;
  };
}

export interface GoogleCalendarEvent {
  id: string;
  summary: string;
  start: { dateTime?: string; date?: string };
  end: { dateTime?: string; date?: string };
  htmlLink: string;
}

export interface WorkBlockSuggestion {
  start: string;
  end: string;
  title: string;
}

export function useCalendarEvents(options: {
  start?: string;
  end?: string;
} = {}) {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [deadlines, setDeadlines] = useState<DeadlineEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchEvents = useCallback(async () => {
    try {
      setIsLoading(true);
      const params = new URLSearchParams();
      if (options.start) params.set("start", options.start);
      if (options.end) params.set("end", options.end);

      const response = await fetch(`/api/calendar/events?${params.toString()}`, {
        credentials: "include",
      });

      if (!response.ok) {
        if (response.status === 401) {
          // Not logged in
          setError("カレンダー機能を使用するにはログインが必要です");
          return;
        }
        throw await parseApiErrorResponse(
          response,
          {
            code: "CALENDAR_EVENTS_FETCH_FAILED",
            userMessage: "カレンダーを読み込めませんでした。",
            action: "ページを再読み込みして、もう一度お試しください。",
            retryable: true,
          },
          "useCalendarEvents.fetch"
        );
      }

      const data = await response.json();
      setEvents(data.events || []);
      setDeadlines(data.deadlines || []);
      setError(null);
    } catch (err) {
      const uiError = toAppUiError(
        err,
        {
          code: "CALENDAR_EVENTS_FETCH_FAILED",
          userMessage: "カレンダーを読み込めませんでした。",
          action: "ページを再読み込みして、もう一度お試しください。",
          retryable: true,
        },
        "useCalendarEvents.fetch"
      );
      setError(uiError.message);
    } finally {
      setIsLoading(false);
    }
  }, [options.start, options.end]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  const createEvent = async (data: {
    type: CalendarEvent["type"];
    title: string;
    startAt: string;
    endAt: string;
    deadlineId?: string;
  }) => {
    const response = await fetch("/api/calendar/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      throw await parseApiErrorResponse(
        response,
        {
          code: "CALENDAR_EVENT_CREATE_FAILED",
          userMessage: "イベントを作成できませんでした。",
          action: "入力内容を確認して、もう一度お試しください。",
          retryable: response.status >= 500,
        },
        "useCalendarEvents.create"
      );
    }

    const result = await response.json();
    await fetchEvents();
    return result.event;
  };

  const deleteEvent = async (id: string) => {
    const response = await fetch(`/api/calendar/events/${id}`, {
      method: "DELETE",
      credentials: "include",
    });

    if (!response.ok) {
      throw await parseApiErrorResponse(
        response,
        {
          code: "CALENDAR_EVENT_DELETE_FAILED",
          userMessage: "イベントを削除できませんでした。",
          action: "時間を置いて、もう一度お試しください。",
          retryable: response.status >= 500,
        },
        "useCalendarEvents.delete"
      );
    }

    await fetchEvents();
  };

  return {
    events,
    deadlines,
    isLoading,
    error,
    refresh: fetchEvents,
    createEvent,
    deleteEvent,
  };
}

export function useCalendarSettings() {
  const [settings, setSettings] = useState<CalendarSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSettings = useCallback(async () => {
    try {
      setIsLoading(true);
      const response = await fetch("/api/calendar/settings", {
        credentials: "include",
      });

      if (!response.ok) {
        if (response.status === 401) {
          setError("カレンダー設定にはログインが必要です");
          return;
        }
        throw await parseApiErrorResponse(
          response,
          {
            code: "CALENDAR_SETTINGS_FETCH_FAILED",
            userMessage: "カレンダー設定を読み込めませんでした。",
            action: "ページを再読み込みして、もう一度お試しください。",
            retryable: true,
          },
          "useCalendarSettings.fetch"
        );
      }

      const data = await response.json();
      setSettings(data.settings);
      setError(null);
    } catch (err) {
      const uiError = toAppUiError(
        err,
        {
          code: "CALENDAR_SETTINGS_FETCH_FAILED",
          userMessage: "カレンダー設定を読み込めませんでした。",
          action: "ページを再読み込みして、もう一度お試しください。",
          retryable: true,
        },
        "useCalendarSettings.fetch"
      );
      setError(uiError.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const updateSettings = async (data: Partial<CalendarSettings>) => {
    const response = await fetch("/api/calendar/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      throw await parseApiErrorResponse(
        response,
        {
          code: "CALENDAR_SETTINGS_UPDATE_FAILED",
          userMessage: "カレンダー設定を更新できませんでした。",
          action: "入力内容を確認して、もう一度お試しください。",
          retryable: response.status >= 500,
        },
        "useCalendarSettings.update"
      );
    }

    const result = await response.json();
    setSettings(result.settings);
    return result.settings;
  };

  return {
    settings,
    isLoading,
    error,
    refresh: fetchSettings,
    updateSettings,
  };
}

export function useGoogleCalendar() {
  const [connectionStatus, setConnectionStatus] = useState<CalendarSettings["connectionStatus"] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const checkConnection = useCallback(async () => {
    try {
      const response = await fetch("/api/calendar/connection-status", {
        credentials: "include",
      });

      if (!response.ok) {
        setConnectionStatus(null);
        return;
      }

      const data = await response.json();
      setConnectionStatus(data.connectionStatus ?? null);
    } catch (err) {
      console.error("Failed to check Google Calendar connection:", err);
    }
  }, []);

  useEffect(() => {
    checkConnection();
  }, [checkConnection]);

  const fetchGoogleEvents = useCallback(async (start: string, end: string): Promise<GoogleCalendarEvent[]> => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ action: "events", start, end });
      const response = await fetch(`/api/calendar/google?${params.toString()}`, {
        credentials: "include",
      });

      if (!response.ok) {
        if (response.status === 403) {
          throw new Error("Google Calendar not connected");
        }
        throw new Error("Failed to fetch Google Calendar events");
      }

      const data = await response.json();
      return data.events || [];
    } catch (err) {
      setError(err instanceof Error ? err.message : "イベントの取得に失敗しました");
      return [];
    } finally {
      setIsLoading(false);
    }
  }, []);

  const suggestWorkBlocks = useCallback(async (date: string): Promise<WorkBlockSuggestion[]> => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ action: "suggest", start: date });
      const response = await fetch(`/api/calendar/google?${params.toString()}`, {
        credentials: "include",
      });

      if (!response.ok) {
        if (response.status === 403) {
          throw new Error("Google Calendar not connected");
        }
        throw new Error("Failed to suggest work blocks");
      }

      const data = await response.json();
      return data.suggestions || [];
    } catch (err) {
      const uiError = toAppUiError(
        err,
        {
          code: "CALENDAR_SUGGEST_WORK_BLOCKS_FAILED",
          userMessage: "作業ブロックの提案を取得できませんでした。",
          action: "Google カレンダーの連携状態を確認して、もう一度お試しください。",
          retryable: true,
        },
        "useGoogleCalendar.suggestWorkBlocks"
      );
      setError(uiError.message);
      throw uiError;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    isConnected: !!connectionStatus?.connected,
    connectionStatus,
    isLoading,
    error,
    checkConnection,
    fetchGoogleEvents,
    suggestWorkBlocks,
  };
}
