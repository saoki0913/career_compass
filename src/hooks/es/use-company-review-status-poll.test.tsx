// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { useCompanyReviewStatusPoll } from "./use-company-review-status-poll";

function jsonResponse(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

function deferredResponse() {
  let resolveResponse: (response: Response) => void = () => {};
  const promise = new Promise<Response>((resolve) => {
    resolveResponse = resolve;
  });
  return { promise, resolveResponse };
}

describe("useCompanyReviewStatusPoll", () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("returns null and does not fetch without a company id or fetched timestamp", () => {
    const fetchMock = vi.mocked(fetch);

    const { result } = renderHook(() =>
      useCompanyReviewStatusPoll({ companyId: null, fetchedAt: null }),
    );

    expect(result.current.statusOverride).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("derives checking status immediately for valid inputs", () => {
    vi.mocked(fetch).mockReturnValue(new Promise<Response>(() => {}));

    const { result } = renderHook(() =>
      useCompanyReviewStatusPoll({ companyId: "company-1", fetchedAt: "2026-05-13T00:00:00.000Z" }),
    );

    expect(result.current.statusOverride).toEqual({
      companyId: "company-1",
      status: "company_status_checking",
      retryCount: 0,
    });
  });

  it("maps ready and not-ready responses", async () => {
    const fetchMock = vi
      .mocked(fetch)
      .mockResolvedValueOnce(jsonResponse({ status: "ready_for_es_review" }))
      .mockResolvedValueOnce(jsonResponse({ status: "company_fetched_but_not_ready" }));

    const ready = renderHook(() =>
      useCompanyReviewStatusPoll({ companyId: "company-1", fetchedAt: "2026-05-13T00:00:00.000Z" }),
    );

    await waitFor(() => {
      expect(ready.result.current.statusOverride?.status).toBe("ready_for_es_review");
    });

    cleanup();

    const notReady = renderHook(() =>
      useCompanyReviewStatusPoll({ companyId: "company-2", fetchedAt: "2026-05-13T00:00:00.000Z" }),
    );

    await waitFor(() => {
      expect(notReady.result.current.statusOverride?.status).toBe("company_fetched_but_not_ready");
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("treats invalid payloads and non-retryable statuses as errors", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse({ status: "ready" }))
      .mockResolvedValueOnce(new Response(null, { status: 404 }));

    const invalidPayload = renderHook(() =>
      useCompanyReviewStatusPoll({ companyId: "company-1", fetchedAt: "2026-05-13T00:00:00.000Z" }),
    );

    await waitFor(() => {
      expect(invalidPayload.result.current.statusOverride).toEqual({
        companyId: "company-1",
        status: "company_status_error",
        retryCount: 0,
      });
    });

    cleanup();

    const notFound = renderHook(() =>
      useCompanyReviewStatusPoll({ companyId: "company-2", fetchedAt: "2026-05-13T00:00:00.000Z" }),
    );

    await waitFor(() => {
      expect(notFound.result.current.statusOverride).toEqual({
        companyId: "company-2",
        status: "company_status_error",
        retryCount: 0,
      });
    });
  });

  it("retries retryable statuses with exponential backoff", async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .mocked(fetch)
      .mockResolvedValueOnce(new Response(null, { status: 500 }))
      .mockResolvedValueOnce(jsonResponse({ status: "ready_for_es_review" }));

    const { result } = renderHook(() =>
      useCompanyReviewStatusPoll({ companyId: "company-1", fetchedAt: "2026-05-13T00:00:00.000Z" }),
    );

    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.statusOverride?.retryCount).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
      await Promise.resolve();
    });

    expect(result.current.statusOverride?.status).toBe("ready_for_es_review");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("retry clears the previous result and refetches", async () => {
    const fetchMock = vi
      .mocked(fetch)
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(jsonResponse({ status: "ready_for_es_review" }));

    const { result } = renderHook(() =>
      useCompanyReviewStatusPoll({ companyId: "company-1", fetchedAt: "2026-05-13T00:00:00.000Z" }),
    );

    await waitFor(() => {
      expect(result.current.statusOverride?.status).toBe("company_status_error");
    });

    act(() => {
      result.current.retry();
    });

    expect(result.current.statusOverride).toEqual({
      companyId: "company-1",
      status: "company_status_checking",
      retryCount: 0,
    });

    await waitFor(() => {
      expect(result.current.statusOverride?.status).toBe("ready_for_es_review");
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("ignores stale results after the fetched timestamp changes", async () => {
    const firstResponse = deferredResponse();
    const secondResponse = deferredResponse();
    const requestSignals: AbortSignal[] = [];
    vi.mocked(fetch).mockImplementation((_, init) => {
      if (init && "signal" in init && init.signal instanceof AbortSignal) {
        requestSignals.push(init.signal);
      }
      return requestSignals.length === 1 ? firstResponse.promise : secondResponse.promise;
    });

    const { result, rerender } = renderHook(
      ({ fetchedAt }) => useCompanyReviewStatusPoll({ companyId: "company-1", fetchedAt }),
      { initialProps: { fetchedAt: "2026-05-13T00:00:00.000Z" } },
    );

    rerender({ fetchedAt: "2026-05-14T00:00:00.000Z" });
    expect(requestSignals[0]?.aborted).toBe(true);
    secondResponse.resolveResponse(jsonResponse({ status: "company_fetched_but_not_ready" }));

    await waitFor(() => {
      expect(result.current.statusOverride?.status).toBe("company_fetched_but_not_ready");
    });

    firstResponse.resolveResponse(jsonResponse({ status: "ready_for_es_review" }));
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.statusOverride?.status).toBe("company_fetched_but_not_ready");
  });
});
