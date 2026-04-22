/**
 * useCredits hook
 *
 * Hook for fetching credits info including balance and monthly free quotas.
 * SWR で `/api/credits` を共有キャッシュし、マウントのたびの重複 fetch を防ぐ。
 */

import useSWR from "swr";
import { parseApiErrorResponse, toAppUiError } from "@/lib/api-errors";
import { notifySwrUserFacingFailure } from "@/lib/client-error-ui";
import { buildAuthFetchHeaders } from "@/lib/swr-fetcher";

const CREDITS_FETCH_FALLBACK = {
  code: "CREDITS_FETCH_FAILED",
  userMessage: "クレジット情報を取得できませんでした。",
  action: "ページを再読み込みして、もう一度お試しください。",
  retryable: true,
} as const;

export interface CreditsInfo {
  type: "user" | "guest";
  plan: "guest" | "free" | "standard" | "pro";
  balance: number;
  monthlyAllocation: number;
  nextResetAt: string | null;
  /** ログインユーザーのみ。企業RAG PDF 取込のページ上限（取込前表示用） */
  ragPdfLimits?: {
    maxPagesIngest: number;
    maxPagesGoogleOcr: number;
    maxPagesMistralOcr: number;
    summaryJa: string;
  };
  monthlyFree: {
    companyRagHtmlPages?: {
      remaining: number;
      limit: number;
    };
    companyRagPdfPages?: {
      remaining: number;
      limit: number;
    };
    /** @deprecated API は companyRagHtmlPages / companyRagPdfPages を返す */
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
    companyRagHtmlPages: { remaining: 0, limit: 0 },
    companyRagPdfPages: { remaining: 0, limit: 0 },
    selectionSchedule: { remaining: 0, limit: 0 },
  },
};

export type CreditsSwrKey = readonly ["/api/credits", "auth" | "guest"];

export function creditsSwrKey(isAuthenticated: boolean): CreditsSwrKey {
  return ["/api/credits", isAuthenticated ? "auth" : "guest"];
}

async function fetchCreditsData(key: CreditsSwrKey): Promise<CreditsInfo> {
  const isAuthenticated = key[1] === "auth";
  const headers = buildAuthFetchHeaders();
  let response = await fetch("/api/credits", {
    headers,
    credentials: "include",
  });

  if (response.ok) {
    return response.json() as Promise<CreditsInfo>;
  }

  if (response.status === 401) {
    if (isAuthenticated) {
      await new Promise((r) => setTimeout(r, 1000));
      response = await fetch("/api/credits", {
        headers,
        credentials: "include",
      });
      if (response.ok) {
        return response.json() as Promise<CreditsInfo>;
      }
      throw await parseApiErrorResponse(response, CREDITS_FETCH_FALLBACK, "useCredits.fetchRetry");
    }
    return GUEST_DEFAULTS;
  }

  throw await parseApiErrorResponse(response, CREDITS_FETCH_FALLBACK, "useCredits.fetch");
}

interface UseCreditsOptions {
  isAuthenticated?: boolean;
  isAuthReady?: boolean;
  initialData?: CreditsInfo;
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
  const { isAuthenticated, isAuthReady, initialData } = opts;
  const canFetch = shouldFetchCredits({ isAuthenticated, isAuthReady });
  const swrKey: CreditsSwrKey | null =
    canFetch && isAuthenticated !== undefined ? creditsSwrKey(isAuthenticated) : null;

  const { data, error, isLoading: swrLoading, mutate } = useSWR(
    swrKey,
    fetchCreditsData,
    {
      fallbackData: initialData,
      revalidateOnFocus: false,
      dedupingInterval: 3000,
      revalidateOnMount: !initialData,
      onError(err, key) {
        const ui = toAppUiError(err, CREDITS_FETCH_FALLBACK, "useCredits.swr");
        notifySwrUserFacingFailure(ui, JSON.stringify(key));
      },
    }
  );

  const isLoading = !canFetch ? isAuthReady !== true : swrLoading;

  const credits = data ?? null;
  const errorMessage =
    error instanceof Error ? error.message : error != null ? String(error) : null;

  const selectionScheduleRemaining = credits?.monthlyFree.selectionSchedule?.remaining ?? 0;
  const selectionScheduleLimit = credits?.monthlyFree.selectionSchedule?.limit ?? 0;

  return {
    credits,
    balance: credits?.balance ?? 0,
    monthlyAllocation: credits?.monthlyAllocation ?? 0,
    nextResetAt: credits?.nextResetAt ? new Date(credits.nextResetAt) : null,
    selectionScheduleRemaining,
    selectionScheduleLimit,
    companyRagUnitsRemaining:
      credits?.monthlyFree.companyRagHtmlPages?.remaining ??
      credits?.monthlyFree.companyRagUnits?.remaining ??
      0,
    companyRagUnitsLimit:
      credits?.monthlyFree.companyRagHtmlPages?.limit ??
      credits?.monthlyFree.companyRagUnits?.limit ??
      0,
    companyRagPdfPagesRemaining: credits?.monthlyFree.companyRagPdfPages?.remaining ?? 0,
    companyRagPdfPagesLimit: credits?.monthlyFree.companyRagPdfPages?.limit ?? 0,
    plan: credits?.plan ?? "guest",
    ragPdfLimits: credits?.ragPdfLimits,
    isLoading,
    error: errorMessage,
    refresh: () => (swrKey ? mutate() : Promise.resolve(undefined)),
  };
}
