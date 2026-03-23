/**
 * useCredits hook
 *
 * Hook for fetching credits info including balance and monthly free quotas.
 * Accepts an optional `isAuthenticated` flag so the 401-to-guest fallback
 * only fires for genuinely unauthenticated sessions — not for transient
 * cookie / session issues experienced by logged-in users.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { getDeviceToken } from "@/lib/auth/device-token";

interface CreditsInfo {
  type: "user" | "guest";
  plan: "guest" | "free" | "standard" | "pro";
  balance: number;
  monthlyAllocation: number;
  nextResetAt: string | null;
  /** ログインユーザーのみ。企業RAG PDF 取込のページ上限（取込前表示用） */
  ragPdfLimits?: {
    maxPagesIngest: number;
    maxPagesOcr: number;
    summaryJa: string;
  };
  monthlyFree: {
    companyRagPages?: {
      remaining: number;
      limit: number;
    };
    /** @deprecated API は companyRagPages を返す */
    companyRagUnits?: {
      remaining: number;
      limit: number;
    };
    /** 選考スケジュール取得の月次無料枠 */
    selectionSchedule?: {
      remaining: number;
      limit: number;
    };
  };
}

const GUEST_DEFAULTS: CreditsInfo = {
  type: "guest",
  plan: "guest",
  balance: 12,
  monthlyAllocation: 12,
  nextResetAt: null,
  monthlyFree: {
    companyRagPages: { remaining: 0, limit: 0 },
    selectionSchedule: { remaining: 0, limit: 0 },
  },
};

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

interface UseCreditsOptions {
  isAuthenticated?: boolean;
  isAuthReady?: boolean;
}

export function shouldFetchCredits(params: {
  isAuthenticated?: boolean;
  isAuthReady?: boolean;
}) {
  return params.isAuthReady !== false && params.isAuthenticated !== undefined;
}

export function shouldUseGuestFallback(params: {
  isAuthenticated?: boolean;
  isAuthReady?: boolean;
}) {
  return params.isAuthReady !== false && params.isAuthenticated === false;
}

export function useCredits(opts: UseCreditsOptions = {}) {
  const { isAuthenticated, isAuthReady } = opts;
  const [credits, setCredits] = useState<CreditsInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const retryCount = useRef(0);

  const fetchCredits = useCallback(async () => {
    if (!shouldFetchCredits({ isAuthenticated, isAuthReady })) {
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch("/api/credits", {
        headers: buildHeaders(),
        credentials: "include",
      });

      if (!response.ok) {
        if (response.status === 401) {
          if (isAuthenticated) {
            if (retryCount.current < 1) {
              retryCount.current += 1;
              await new Promise((r) => setTimeout(r, 1000));
              const retryResp = await fetch("/api/credits", {
                headers: buildHeaders(),
                credentials: "include",
              });
              if (retryResp.ok) {
                const data: CreditsInfo = await retryResp.json();
                setCredits(data);
                retryCount.current = 0;
                return;
              }
            }
            setError("クレジット情報を取得できませんでした");
            return;
          }
          if (shouldUseGuestFallback({ isAuthenticated, isAuthReady })) {
            setCredits(GUEST_DEFAULTS);
          }
          return;
        }
        throw new Error("Failed to fetch credits");
      }

      retryCount.current = 0;
      const data: CreditsInfo = await response.json();
      setCredits(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch credits");
    } finally {
      setIsLoading(false);
    }
  }, [isAuthenticated, isAuthReady]);

  useEffect(() => {
    if (!shouldFetchCredits({ isAuthenticated, isAuthReady })) {
      setIsLoading(isAuthReady !== true);
      return;
    }
    fetchCredits();
  }, [fetchCredits, isAuthenticated, isAuthReady]);

  const selectionScheduleRemaining = credits?.monthlyFree.selectionSchedule?.remaining ?? 0;
  const selectionScheduleLimit = credits?.monthlyFree.selectionSchedule?.limit ?? 0;

  return {
    credits,
    balance: credits?.balance ?? 0,
    monthlyAllocation: credits?.monthlyAllocation ?? 0,
    nextResetAt: credits?.nextResetAt ? new Date(credits.nextResetAt) : null,
    /** @deprecated 選考スケジュールは月次。`selectionScheduleRemaining` を優先 */
    dailyFreeRemaining: selectionScheduleRemaining,
    /** @deprecated 選考スケジュールは月次。`selectionScheduleLimit` を優先 */
    dailyFreeLimit: selectionScheduleLimit,
    selectionScheduleFreeRemaining: selectionScheduleRemaining,
    selectionScheduleFreeLimit: selectionScheduleLimit,
    companyRagUnitsRemaining:
      credits?.monthlyFree.companyRagPages?.remaining ??
      credits?.monthlyFree.companyRagUnits?.remaining ??
      0,
    companyRagUnitsLimit:
      credits?.monthlyFree.companyRagPages?.limit ??
      credits?.monthlyFree.companyRagUnits?.limit ??
      0,
    plan: credits?.plan ?? "guest",
    ragPdfLimits: credits?.ragPdfLimits,
    isLoading,
    error,
    refresh: fetchCredits,
  };
}
