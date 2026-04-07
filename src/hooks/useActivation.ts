/**
 * useActivation hook
 *
 * Fetch activation checklist progress for guiding new users to their first value.
 */

import { useCallback, useEffect, useState } from "react";
import { parseApiErrorResponse, toAppUiError } from "@/lib/api-errors";
import { notifyUserFacingAppError } from "@/lib/client-error-ui";

export type ActivationStepId = "company" | "motivation" | "profile";

export interface ActivationStep {
  label: string;
  done: boolean;
  count: number;
  href: string;
}

export interface ActivationProgress {
  steps: Record<ActivationStepId, ActivationStep>;
  completedSteps: number;
  totalSteps: number;
  nextAction: { href: string; label: string } | null;
}

interface UseActivationOptions {
  initialData?: ActivationProgress | null;
}

function buildHeaders(): Record<string, string> {
  return {
    "Content-Type": "application/json",
  };
}

export function useActivation(options: UseActivationOptions = {}) {
  const [data, setData] = useState<ActivationProgress | null>(() => options.initialData ?? null);
  const [isLoading, setIsLoading] = useState(() => !options.initialData);
  const [error, setError] = useState<string | null>(null);

  const fetchActivation = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const res = await fetch("/api/activation", {
        headers: buildHeaders(),
        credentials: "include",
      });

      if (!res.ok) {
        if (res.status === 401) {
          setData(null);
          return;
        }
        throw await parseApiErrorResponse(
          res,
          {
            code: "ACTIVATION_FETCH_FAILED",
            userMessage: "利用状況を読み込めませんでした。",
            action: "ページを再読み込みして、もう一度お試しください。",
            retryable: true,
          },
          "useActivation.fetch"
        );
      }

      const json: ActivationProgress = await res.json();
      setData(json);
    } catch (err) {
      const uiError = toAppUiError(
        err,
        {
          code: "ACTIVATION_FETCH_FAILED",
          userMessage: "利用状況を読み込めませんでした。",
          action: "ページを再読み込みして、もう一度お試しください。",
          retryable: true,
        },
        "useActivation.fetch"
      );
      setError(uiError.message);
      notifyUserFacingAppError(uiError);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (options.initialData) {
      return;
    }
    fetchActivation();
  }, [fetchActivation, options.initialData]);

  return { data, isLoading, error, refresh: fetchActivation };
}
