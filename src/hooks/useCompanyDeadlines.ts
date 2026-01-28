/**
 * useCompanyDeadlines hook
 *
 * Hook for managing deadlines for a specific company (CRUD operations)
 */

import { useState, useEffect, useCallback } from "react";
import { getDeviceToken } from "@/lib/auth/device-token";

export type DeadlineType =
  | "es_submission"
  | "web_test"
  | "aptitude_test"
  | "interview_1"
  | "interview_2"
  | "interview_3"
  | "interview_final"
  | "briefing"
  | "internship"
  | "offer_response"
  | "other";

export interface Deadline {
  id: string;
  companyId: string;
  type: DeadlineType;
  title: string;
  description: string | null;
  memo: string | null;
  dueDate: string;
  isConfirmed: boolean;
  confidence: "high" | "medium" | "low" | null;
  sourceUrl: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateDeadlineInput {
  type: DeadlineType;
  title: string;
  description?: string;
  memo?: string;
  dueDate: string;
  sourceUrl?: string;
}

export interface UpdateDeadlineInput {
  type?: DeadlineType;
  title?: string;
  description?: string;
  memo?: string;
  dueDate?: string;
  sourceUrl?: string;
  isConfirmed?: boolean;
  completedAt?: string | null;
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

export function useCompanyDeadlines(companyId: string | null) {
  const [deadlines, setDeadlines] = useState<Deadline[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDeadlines = useCallback(async () => {
    if (!companyId) {
      setDeadlines([]);
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch(`/api/companies/${companyId}/deadlines`, {
        headers: buildHeaders(),
        credentials: "include",
      });

      if (!response.ok) {
        if (response.status === 401) {
          setDeadlines([]);
          return;
        }
        throw new Error("Failed to fetch deadlines");
      }

      const data = await response.json();
      setDeadlines(data.deadlines);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch deadlines");
    } finally {
      setIsLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    fetchDeadlines();
  }, [fetchDeadlines]);

  const createDeadline = useCallback(
    async (input: CreateDeadlineInput): Promise<Deadline | null> => {
      if (!companyId) return null;

      try {
        const response = await fetch(`/api/companies/${companyId}/deadlines`, {
          method: "POST",
          headers: buildHeaders(),
          credentials: "include",
          body: JSON.stringify(input),
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || "Failed to create deadline");
        }

        const data = await response.json();
        const newDeadline = data.deadline;

        // Update local state
        setDeadlines((prev) => [...prev, newDeadline].sort(
          (a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()
        ));

        return newDeadline;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to create deadline");
        return null;
      }
    },
    [companyId]
  );

  const updateDeadline = useCallback(
    async (deadlineId: string, input: UpdateDeadlineInput): Promise<Deadline | null> => {
      try {
        const response = await fetch(`/api/deadlines/${deadlineId}`, {
          method: "PUT",
          headers: buildHeaders(),
          credentials: "include",
          body: JSON.stringify(input),
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || "Failed to update deadline");
        }

        const data = await response.json();
        const updatedDeadline = data.deadline;

        // Update local state
        setDeadlines((prev) =>
          prev
            .map((d) => (d.id === deadlineId ? updatedDeadline : d))
            .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
        );

        return updatedDeadline;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to update deadline");
        return null;
      }
    },
    []
  );

  const deleteDeadline = useCallback(async (deadlineId: string): Promise<boolean> => {
    try {
      const response = await fetch(`/api/deadlines/${deadlineId}`, {
        method: "DELETE",
        headers: buildHeaders(),
        credentials: "include",
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to delete deadline");
      }

      // Update local state
      setDeadlines((prev) => prev.filter((d) => d.id !== deadlineId));

      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete deadline");
      return false;
    }
  }, []);

  const toggleComplete = useCallback(
    async (deadlineId: string): Promise<boolean> => {
      const deadline = deadlines.find((d) => d.id === deadlineId);
      if (!deadline) return false;

      const newCompletedAt = deadline.completedAt ? null : new Date().toISOString();

      const result = await updateDeadline(deadlineId, { completedAt: newCompletedAt });
      return result !== null;
    },
    [deadlines, updateDeadline]
  );

  const confirmDeadline = useCallback(
    async (deadlineId: string): Promise<boolean> => {
      const result = await updateDeadline(deadlineId, { isConfirmed: true });
      return result !== null;
    },
    [updateDeadline]
  );

  return {
    deadlines,
    isLoading,
    error,
    refresh: fetchDeadlines,
    createDeadline,
    updateDeadline,
    deleteDeadline,
    toggleComplete,
    confirmDeadline,
  };
}

// Deadline type labels in Japanese
export const DEADLINE_TYPE_LABELS: Record<DeadlineType, string> = {
  es_submission: "ES提出",
  web_test: "WEBテスト",
  aptitude_test: "適性検査",
  interview_1: "一次面接",
  interview_2: "二次面接",
  interview_3: "三次面接",
  interview_final: "最終面接",
  briefing: "説明会",
  internship: "インターン参加",
  offer_response: "内定返答",
  other: "その他",
};
