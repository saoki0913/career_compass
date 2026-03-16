/**
 * useActivation hook
 *
 * Fetch activation checklist progress for guiding new users to their first value.
 */

import { useCallback, useEffect, useState } from "react";
import { getDeviceToken } from "@/lib/auth/device-token";
import { parseApiErrorResponse, toAppUiError } from "@/lib/api-errors";

export type ActivationStepId = "company" | "deadline" | "es" | "ai_review";

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
      // ignore
    }
  }
  return headers;
}

export function useActivation() {
  const [data, setData] = useState<ActivationProgress | null>(null);
  const [isLoading, setIsLoading] = useState(true);
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
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchActivation();
  }, [fetchActivation]);

  return { data, isLoading, error, refresh: fetchActivation };
}
