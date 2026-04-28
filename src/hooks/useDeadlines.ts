/**
 * useDeadlines hook
 *
 * Hook for fetching upcoming deadlines
 */

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { parseApiErrorResponse, toAppUiError } from "@/lib/api-errors";
import { notifyUserFacingAppError } from "@/lib/client-error-ui";

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

interface UseDeadlinesOptions {
  initialData?: DeadlinesResponse;
}

function buildHeaders(): Record<string, string> {
  return {
    "Content-Type": "application/json",
  };
}

export function useDeadlines(days: number = 7, options: UseDeadlinesOptions = {}) {
  const { isLoading: isAuthLoading } = useAuth();
  const initialMatchesDays = options.initialData?.periodDays === days;
  const [deadlines, setDeadlines] = useState<Deadline[]>(() => options.initialData?.deadlines ?? []);
  const [count, setCount] = useState(() => options.initialData?.count ?? 0);
  const [isLoading, setIsLoading] = useState(() => !options.initialData);
  const [error, setError] = useState<string | null>(null);

  const fetchDeadlines = useCallback(async () => {
    if (isAuthLoading) {
      return;
    }

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
      notifyUserFacingAppError(uiError);
    } finally {
      setIsLoading(false);
    }
  }, [days, isAuthLoading]);

  useEffect(() => {
    if (options.initialData && initialMatchesDays) {
      setDeadlines(options.initialData.deadlines);
      setCount(options.initialData.count);
      setIsLoading(false);
      setError(null);
      return;
    }
    if (isAuthLoading) {
      return;
    }
    fetchDeadlines();
  }, [fetchDeadlines, initialMatchesDays, isAuthLoading, options.initialData]);

  return {
    deadlines,
    count,
    isLoading: isAuthLoading || isLoading,
    error,
    refresh: fetchDeadlines,
  };
}
