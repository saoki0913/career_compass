/**
 * useCompanyDeadlines hook
 *
 * Hook for managing deadlines for a specific company (CRUD operations)
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { trackEvent } from "@/lib/analytics/client";
import { parseApiErrorResponse, toAppUiError } from "@/lib/api-errors";
import { notifyUserFacingAppError } from "@/lib/client-error-ui";

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
  return {
    "Content-Type": "application/json",
  };
}

interface UseCompanyDeadlinesOptions {
  initialData?: Deadline[];
}

export function useCompanyDeadlines(companyId: string | null, options: UseCompanyDeadlinesOptions = {}) {
  const [deadlines, setDeadlines] = useState<Deadline[]>(() => options.initialData ?? []);
  const [isLoading, setIsLoading] = useState(() => !options.initialData);
  const [error, setError] = useState<string | null>(null);
  const skipInitialFetchRef = useRef(Boolean(options.initialData));

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
        throw await parseApiErrorResponse(
          response,
          {
            code: "COMPANY_DEADLINES_FETCH_FAILED",
            userMessage: "締切情報を読み込めませんでした。",
            action: "ページを再読み込みして、もう一度お試しください。",
            retryable: true,
          },
          "useCompanyDeadlines.fetchDeadlines"
        );
      }

      const data = await response.json();
      setDeadlines(data.deadlines);
    } catch (err) {
      const uiError = toAppUiError(
        err,
        {
          code: "COMPANY_DEADLINES_FETCH_FAILED",
          userMessage: "締切情報を読み込めませんでした。",
          action: "ページを再読み込みして、もう一度お試しください。",
          retryable: true,
        },
        "useCompanyDeadlines.fetchDeadlines"
      );
      setError(uiError.message);
      notifyUserFacingAppError(uiError);
    } finally {
      setIsLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    if (skipInitialFetchRef.current) {
      skipInitialFetchRef.current = false;
      return;
    }
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
          throw await parseApiErrorResponse(
            response,
            {
              code: "DEADLINE_CREATE_FAILED",
              userMessage: "締切を追加できませんでした。",
              action: "入力内容を確認して、もう一度お試しください。",
              retryable: true,
            },
            "useCompanyDeadlines.createDeadline"
          );
        }

        const data = await response.json();
        const newDeadline = data.deadline;

        trackEvent("deadline_create", { type: input.type });

        // Update local state
        setDeadlines((prev) => [...prev, newDeadline].sort(
          (a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()
        ));

        return newDeadline;
      } catch (err) {
        const uiError = toAppUiError(
          err,
          {
            code: "DEADLINE_CREATE_FAILED",
            userMessage: "締切を追加できませんでした。",
            action: "入力内容を確認して、もう一度お試しください。",
            retryable: true,
          },
          "useCompanyDeadlines.createDeadline"
        );
        setError(uiError.message);
        notifyUserFacingAppError(uiError);
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
          throw await parseApiErrorResponse(
            response,
            {
              code: "DEADLINE_UPDATE_FAILED",
              userMessage: "締切を更新できませんでした。",
              action: "入力内容を確認して、もう一度お試しください。",
              retryable: true,
            },
            "useCompanyDeadlines.updateDeadline"
          );
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
        const uiError = toAppUiError(
          err,
          {
            code: "DEADLINE_UPDATE_FAILED",
            userMessage: "締切を更新できませんでした。",
            action: "入力内容を確認して、もう一度お試しください。",
            retryable: true,
          },
          "useCompanyDeadlines.updateDeadline"
        );
        setError(uiError.message);
        notifyUserFacingAppError(uiError);
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
        throw await parseApiErrorResponse(
          response,
          {
            code: "DEADLINE_DELETE_FAILED",
            userMessage: "締切を削除できませんでした。",
            action: "時間を置いて、もう一度お試しください。",
            retryable: true,
          },
          "useCompanyDeadlines.deleteDeadline"
        );
      }

      // Update local state
      setDeadlines((prev) => prev.filter((d) => d.id !== deadlineId));

      return true;
    } catch (err) {
      const uiError = toAppUiError(
        err,
        {
          code: "DEADLINE_DELETE_FAILED",
          userMessage: "締切を削除できませんでした。",
          action: "時間を置いて、もう一度お試しください。",
          retryable: true,
        },
        "useCompanyDeadlines.deleteDeadline"
      );
      setError(uiError.message);
      notifyUserFacingAppError(uiError);
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
