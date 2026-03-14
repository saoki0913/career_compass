/**
 * useDeadlines hook
 *
 * Hook for fetching upcoming deadlines
 */

import { useState, useEffect, useCallback } from "react";
import { getDeviceToken } from "@/lib/auth/device-token";
import { parseApiErrorResponse, toAppUiError } from "@/lib/api-errors";

export interface Deadline {
  id: string;
  companyId: string;
  company: string;
  type: string;
  title: string;
  description: string | null;
  dueDate: string;
  daysLeft: number;
  isConfirmed: boolean;
  confidence: "high" | "medium" | "low" | null;
  sourceUrl: string | null;
}

interface DeadlinesResponse {
  deadlines: Deadline[];
  count: number;
  periodDays: number;
}

function buildHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (typeof window !== "undefined") {
    try {
      const deviceToken = getDeviceToken();
      if (deviceToken) {
        headers["x-device-token"] = deviceToken;
      }
    } catch {
      // Ignore errors
    }
  }
  return headers;
}

export function useDeadlines(days: number = 7) {
  const [deadlines, setDeadlines] = useState<Deadline[]>([]);
  const [count, setCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDeadlines = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch(`/api/deadlines/upcoming?days=${days}`, {
        headers: buildHeaders(),
        credentials: "include",
      });

      if (!response.ok) {
        if (response.status === 401) {
          // Not authenticated
          setDeadlines([]);
          setCount(0);
          return;
        }
        throw await parseApiErrorResponse(
          response,
          {
            code: "UPCOMING_DEADLINES_FETCH_FAILED",
            userMessage: "締切一覧を読み込めませんでした。",
            action: "ページを再読み込みして、もう一度お試しください。",
            retryable: true,
          },
          "useDeadlines.fetch"
        );
      }

      const data: DeadlinesResponse = await response.json();
      setDeadlines(data.deadlines);
      setCount(data.count);
    } catch (err) {
      const uiError = toAppUiError(
        err,
        {
          code: "UPCOMING_DEADLINES_FETCH_FAILED",
          userMessage: "締切一覧を読み込めませんでした。",
          action: "ページを再読み込みして、もう一度お試しください。",
          retryable: true,
        },
        "useDeadlines.fetch"
      );
      setError(uiError.message);
    } finally {
      setIsLoading(false);
    }
  }, [days]);

  useEffect(() => {
    fetchDeadlines();
  }, [fetchDeadlines]);

  return {
    deadlines,
    count,
    isLoading,
    error,
    refresh: fetchDeadlines,
  };
}
