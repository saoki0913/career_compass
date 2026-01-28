/**
 * useDeadlines hook
 *
 * Hook for fetching upcoming deadlines
 */

import { useState, useEffect, useCallback } from "react";
import { getDeviceToken } from "@/lib/auth/device-token";

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
        throw new Error("Failed to fetch deadlines");
      }

      const data: DeadlinesResponse = await response.json();
      setDeadlines(data.deadlines);
      setCount(data.count);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch deadlines");
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
