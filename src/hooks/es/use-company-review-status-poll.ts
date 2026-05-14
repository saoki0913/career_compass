"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CompanyReviewStatusOverride } from "@/lib/es-review/company-review-status";
import { isRetryableStatusCode } from "@/lib/es-review/company-review-status";

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 2000;

interface UseCompanyReviewStatusPollArgs {
  companyId: string | null;
  fetchedAt: string | Date | null;
}

type PollResult = {
  requestKey: string;
  override: CompanyReviewStatusOverride;
};

type RetryState = {
  requestKey: string;
  count: number;
};

type CompanyReviewStatusPayload = {
  status: "company_status_checking" | "company_fetched_but_not_ready" | "ready_for_es_review";
};

function normalizeFetchedAt(value: string | Date | null): string | null {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }

  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? trimmed : parsed.toISOString();
}

function makeRequestKey(companyId: string | null, fetchedAt: string | Date | null): string | null {
  const fetchedAtKey = normalizeFetchedAt(fetchedAt);
  return companyId && fetchedAtKey ? `${companyId}:${fetchedAtKey}` : null;
}

function parseCompanyReviewStatusPayload(value: unknown): CompanyReviewStatusPayload | null {
  if (!value || typeof value !== "object") return null;
  const status = (value as Record<string, unknown>).status;
  if (
    status === "company_status_checking" ||
    status === "company_fetched_but_not_ready" ||
    status === "ready_for_es_review"
  ) {
    return { status };
  }
  return null;
}

export function useCompanyReviewStatusPoll({
  companyId,
  fetchedAt,
}: UseCompanyReviewStatusPollArgs): {
  statusOverride: CompanyReviewStatusOverride | null;
  retry: () => void;
} {
  const requestKey = makeRequestKey(companyId, fetchedAt);
  const [result, setResult] = useState<PollResult | null>(null);
  const [retryState, setRetryState] = useState<RetryState | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const fetchStatusRef = useRef<(cId: string, key: string, retryCount: number) => void>(() => {});

  const clearPending = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
  }, []);

  const fetchStatus = useCallback(
    (cId: string, key: string, retryCount: number) => {
      clearPending();
      const controller = new AbortController();
      abortRef.current = controller;

      void fetch(`/api/companies/${cId}/es-review-status`, {
        credentials: "include",
        cache: "no-store",
        signal: controller.signal,
      })
        .then(async (response) => {
          if (controller.signal.aborted) return;

          if (!response.ok) {
            if (!isRetryableStatusCode(response.status)) {
              setResult({
                requestKey: key,
                override: {
                  companyId: cId,
                  status: "company_status_error",
                  retryCount,
                },
              });
              return;
            }
            throw new Error(`Status ${response.status}`);
          }

          const data = await response.json();
          if (controller.signal.aborted) return;

          const parsed = parseCompanyReviewStatusPayload(data);
          if (!parsed) {
            setResult({
              requestKey: key,
              override: {
                companyId: cId,
                status: "company_status_error",
                retryCount,
              },
            });
            return;
          }

          setResult({
            requestKey: key,
            override: { companyId: cId, status: parsed.status, retryCount: 0 },
          });
        })
        .catch((err: unknown) => {
          if (controller.signal.aborted) return;
          if (err instanceof DOMException && err.name === "AbortError") return;

          const nextRetry = retryCount + 1;
          if (nextRetry > MAX_RETRIES) {
            setResult({
              requestKey: key,
              override: {
                companyId: cId,
                status: "company_status_error",
                retryCount: nextRetry,
              },
            });
            return;
          }

          setRetryState({ requestKey: key, count: nextRetry });
          const delay = BASE_DELAY_MS * Math.pow(2, retryCount);
          timeoutRef.current = setTimeout(
            () => fetchStatusRef.current(cId, key, nextRetry),
            Math.min(delay, 15000),
          );
        });
    },
    [clearPending],
  );

  useEffect(() => {
    fetchStatusRef.current = fetchStatus;
  }, [fetchStatus]);

  useEffect(() => {
    if (!companyId || !requestKey) {
      clearPending();
      return;
    }
    fetchStatus(companyId, requestKey, 0);
    return clearPending;
  }, [companyId, requestKey, fetchStatus, clearPending]);

  const retry = useCallback(() => {
    if (!companyId || !requestKey) return;
    setResult(null);
    setRetryState(null);
    fetchStatus(companyId, requestKey, 0);
  }, [companyId, requestKey, fetchStatus]);

  const statusOverride = requestKey && companyId
    ? result?.requestKey === requestKey
      ? result.override
      : {
          companyId,
          status: "company_status_checking" as const,
          retryCount: retryState?.requestKey === requestKey ? retryState.count : 0,
        }
    : null;

  return { statusOverride, retry };
}
