/**
 * useIncompleteItems Hook
 *
 * Fetches incomplete items for the Zeigarnik Effect UX enhancement
 * - Draft ES documents
 * - In-progress Gakuchika sessions
 */

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { AppUiError, parseApiErrorResponse, toAppUiError } from "@/lib/api-errors";

export interface DraftES {
  id: string;
  title: string;
  company: string | null;
  updatedAt: string;
}

export interface InProgressGakuchika {
  id: string;
  title: string;
  updatedAt: string;
}

export interface IncompleteItemsData {
  draftES: DraftES[];
  draftESCount: number;
  inProgressGakuchika: InProgressGakuchika[];
  inProgressGakuchikaCount: number;
}

interface UseIncompleteItemsResult {
  data: IncompleteItemsData | null;
  isLoading: boolean;
  error: string | null;
  errorInfo: AppUiError | null;
  refetch: () => void;
}

interface UseIncompleteItemsOptions {
  initialData?: IncompleteItemsData | null;
}

export function useIncompleteItems(options: UseIncompleteItemsOptions = {}): UseIncompleteItemsResult {
  const { isLoading: isAuthLoading } = useAuth();
  const [data, setData] = useState<IncompleteItemsData | null>(() => options.initialData ?? null);
  const [isLoading, setIsLoading] = useState(() => !options.initialData);
  const [error, setError] = useState<string | null>(null);
  const [errorInfo, setErrorInfo] = useState<AppUiError | null>(null);

  const fetchIncompleteItems = useCallback(async () => {
    try {
      if (isAuthLoading) {
        return;
      }

      setIsLoading(true);
      setError(null);
      setErrorInfo(null);

      const headers: HeadersInit = {
        "Content-Type": "application/json",
      };

      const response = await fetch("/api/dashboard/incomplete", {
        headers,
        credentials: "include",
      });

      if (!response.ok) {
        if (response.status === 401) {
          setData({
            draftES: [],
            draftESCount: 0,
            inProgressGakuchika: [],
            inProgressGakuchikaCount: 0,
          });
          return;
        }

        throw await parseApiErrorResponse(
          response,
          {
            code: "INCOMPLETE_ITEMS_FETCH_FAILED",
            userMessage: "途中のタスクを読み込めませんでした。",
            action: "ページを再読み込みして、もう一度お試しください。",
            retryable: true,
            authMessage: "ログイン状態を確認して、もう一度お試しください。",
          },
          "useIncompleteItems.fetch"
        );
      }

      const result = await response.json();
      setData(result);
    } catch (err) {
      const uiError = toAppUiError(
        err,
        {
          code: "INCOMPLETE_ITEMS_FETCH_FAILED",
          userMessage: "途中のタスクを読み込めませんでした。",
          action: "ページを再読み込みして、もう一度お試しください。",
          retryable: true,
        },
        "useIncompleteItems.fetch"
      );
      setError(uiError.message);
      setErrorInfo(uiError);
    } finally {
      setIsLoading(false);
    }
  }, [isAuthLoading]);

  useEffect(() => {
    if (options.initialData) {
      return;
    }
    if (isAuthLoading) {
      return;
    }

    fetchIncompleteItems();
  }, [fetchIncompleteItems, isAuthLoading, options.initialData]);

  return {
    data,
    isLoading: isAuthLoading || isLoading,
    error,
    errorInfo,
    refetch: fetchIncompleteItems,
  };
}

// Helper to check if there are any incomplete items
export function hasIncompleteItems(data: IncompleteItemsData | null): boolean {
  if (!data) return false;
  return data.draftESCount > 0 || data.inProgressGakuchikaCount > 0;
}

export default useIncompleteItems;
