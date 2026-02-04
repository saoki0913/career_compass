"use client";

import { useState, useEffect, useCallback } from "react";

export interface CalendarEvent {
  id: string;
  userId: string;
  deadlineId: string | null;
  externalEventId: string | null;
  type: "deadline" | "work_block";
  title: string;
  startAt: string;
  endAt: string;
  createdAt: string;
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
  isGoogleConnected: boolean;
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
        throw new Error("Failed to fetch events");
      }

      const data = await response.json();
      setEvents(data.events || []);
      setDeadlines(data.deadlines || []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "イベントの取得に失敗しました");
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
      const errorData = await response.json();
      throw new Error(errorData.error || "イベントの作成に失敗しました");
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
      const errorData = await response.json();
      throw new Error(errorData.error || "イベントの削除に失敗しました");
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
        throw new Error("Failed to fetch settings");
      }

      const data = await response.json();
      setSettings(data.settings);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "設定の取得に失敗しました");
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
      const errorData = await response.json();
      throw new Error(errorData.error || "設定の更新に失敗しました");
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
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const checkConnection = useCallback(async () => {
    try {
      const response = await fetch("/api/calendar/google?action=events&start=2026-01-01T00:00:00Z&end=2026-01-02T00:00:00Z", {
        credentials: "include",
      });

      if (response.status === 403) {
        const data = await response.json();
        if (data.code === "NOT_CONNECTED") {
          setIsConnected(false);
          return;
        }
      }

      if (response.ok) {
        setIsConnected(true);
      }
    } catch (err) {
      console.error("Failed to check Google Calendar connection:", err);
    }
  }, []);

  useEffect(() => {
    checkConnection();
  }, [checkConnection]);

  const fetchGoogleEvents = async (start: string, end: string): Promise<GoogleCalendarEvent[]> => {
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
  };

  const suggestWorkBlocks = async (date: string): Promise<WorkBlockSuggestion[]> => {
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
      setError(err instanceof Error ? err.message : "タスクの提案に失敗しました");
      return [];
    } finally {
      setIsLoading(false);
    }
  };

  const createGoogleEvent = async (event: {
    title: string;
    startAt: string;
    endAt: string;
    description?: string;
  }) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/calendar/google", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          action: "create",
          ...event,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to create Google Calendar event");
      }

      const data = await response.json();
      return data.event;
    } catch (err) {
      setError(err instanceof Error ? err.message : "イベントの作成に失敗しました");
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  return {
    isConnected,
    isLoading,
    error,
    checkConnection,
    fetchGoogleEvents,
    suggestWorkBlocks,
    createGoogleEvent,
  };
}
