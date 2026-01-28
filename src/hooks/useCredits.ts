/**
 * useCredits hook
 *
 * Hook for fetching credits info including balance and daily free usage
 */

import { useState, useEffect, useCallback } from "react";
import { getDeviceToken } from "@/lib/auth/device-token";

interface CreditsInfo {
  type: "user" | "guest";
  plan: "guest" | "free" | "standard" | "pro";
  balance: number;
  monthlyAllocation: number;
  nextResetAt: string | null;
  dailyFree: {
    companyFetch: {
      remaining: number;
      limit: number;
    };
  };
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

export function useCredits() {
  const [credits, setCredits] = useState<CreditsInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCredits = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch("/api/credits", {
        headers: buildHeaders(),
        credentials: "include",
      });

      if (!response.ok) {
        if (response.status === 401) {
          // Not authenticated, use default guest values
          setCredits({
            type: "guest",
            plan: "guest",
            balance: 15,
            monthlyAllocation: 15,
            nextResetAt: null,
            dailyFree: {
              companyFetch: {
                remaining: 2,
                limit: 2,
              },
            },
          });
          return;
        }
        throw new Error("Failed to fetch credits");
      }

      const data: CreditsInfo = await response.json();
      setCredits(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch credits");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCredits();
  }, [fetchCredits]);

  return {
    credits,
    balance: credits?.balance ?? 0,
    monthlyAllocation: credits?.monthlyAllocation ?? 0,
    nextResetAt: credits?.nextResetAt ? new Date(credits.nextResetAt) : null,
    dailyFreeRemaining: credits?.dailyFree.companyFetch.remaining ?? 0,
    dailyFreeLimit: credits?.dailyFree.companyFetch.limit ?? 0,
    plan: credits?.plan ?? "guest",
    isLoading,
    error,
    refresh: fetchCredits,
  };
}
