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

export function useCompanyReviewStatusPoll({
  companyId,
  fetchedAt,
}: UseCompanyReviewStatusPollArgs): {
  statusOverride: CompanyReviewStatusOverride | null;
  retry: () => void;
} {
  const [statusOverride, setStatusOverride] = useState<CompanyReviewStatusOverride | null>(null);
  const retryCountRef = useRef(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const fetchStatusRef = useRef<(cId: string, retryCount: number) => void>(() => {});

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
    (cId: string, retryCount: number) => {
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
              setStatusOverride({
                companyId: cId,
                status: "company_status_error",
                retryCount,
              });
              return;
            }
            throw new Error(`Status ${response.status}`);
          }

          const data = await response.json();
          if (controller.signal.aborted) return;

          const resolved: CompanyReviewStatusOverride["status"] =
            data.status === "ready_for_es_review"
              ? "ready_for_es_review"
              : data.status === "company_fetched_but_not_ready"
                ? "company_fetched_but_not_ready"
                : "company_status_checking";

          setStatusOverride({ companyId: cId, status: resolved, retryCount: 0 });
          retryCountRef.current = 0;
        })
        .catch((err: unknown) => {
          if (controller.signal.aborted) return;
          if (err instanceof DOMException && err.name === "AbortError") return;

          const nextRetry = retryCount + 1;
          if (nextRetry > MAX_RETRIES) {
            setStatusOverride({
              companyId: cId,
              status: "company_status_error",
              retryCount: nextRetry,
            });
            return;
          }

          setStatusOverride({
            companyId: cId,
            status: "company_status_checking",
            retryCount: nextRetry,
          });
          retryCountRef.current = nextRetry;
          const delay = BASE_DELAY_MS * Math.pow(2, retryCount);
          timeoutRef.current = setTimeout(
            () => fetchStatusRef.current(cId, nextRetry),
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
    if (!companyId || !fetchedAt) {
      clearPending();
      setStatusOverride(null);
      retryCountRef.current = 0;
      return;
    }
    retryCountRef.current = 0;
    setStatusOverride({
      companyId,
      status: "company_status_checking",
      retryCount: 0,
    });
    fetchStatus(companyId, 0);
    return clearPending;
  }, [companyId, fetchedAt, fetchStatus, clearPending]);

  const retry = useCallback(() => {
    if (!companyId || !fetchedAt) return;
    retryCountRef.current = 0;
    setStatusOverride({
      companyId,
      status: "company_status_checking",
      retryCount: 0,
    });
    fetchStatus(companyId, 0);
  }, [companyId, fetchedAt, fetchStatus]);

  return { statusOverride, retry };
}
