// @vitest-environment jsdom

import { readFile } from "node:fs/promises";
import { afterEach, describe, it, expect, vi } from "vitest";
import { cleanup, renderHook, waitFor } from "@testing-library/react";

const { notifyUserFacingAppErrorMock } = vi.hoisted(() => ({
  notifyUserFacingAppErrorMock: vi.fn(),
}));

vi.mock("@/lib/client-error-ui", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/client-error-ui")>();
  return {
    ...actual,
    notifyUserFacingAppError: notifyUserFacingAppErrorMock,
  };
});

vi.mock("@/lib/analytics/client", () => ({
  trackEvent: vi.fn(),
}));

const emptyCompaniesResponse = {
  companies: [],
  count: 0,
  limit: 3,
  canAddMore: true,
};

describe("useCompanies", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    notifyUserFacingAppErrorMock.mockClear();
  });

  it("exports correctly", async () => {
    const mod = await import("./useCompanies");
    expect(mod.useCompanies).toBeDefined();
  });

  it("exposes narrow phase movement helpers for kanban updates", async () => {
    const source = await readFile(`${process.cwd()}/src/hooks/useCompanies.ts`, "utf8");
    expect(source).toContain("updateCompanyStatus");
    expect(source).toContain("moveCompanyToPhase");
    expect(source).toContain("getDefaultStatusForPhase");
  });

  it("does not fetch before identity is enabled", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { useCompanies } = await import("./useCompanies");

    const { result } = renderHook(() => useCompanies({ enabled: false }));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(notifyUserFacingAppErrorMock).not.toHaveBeenCalled();
  });

  it("fetches once after identity is enabled", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => emptyCompaniesResponse,
      headers: new Headers({ "content-type": "application/json" }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const { useCompanies } = await import("./useCompanies");

    const { result, rerender } = renderHook(
      ({ enabled }) => useCompanies({ enabled }),
      { initialProps: { enabled: false } },
    );

    expect(fetchMock).not.toHaveBeenCalled();
    rerender({ enabled: true });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.current.count).toBe(0);
  });

  it("keeps explicit refresh available when automatic fetch is disabled", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => emptyCompaniesResponse,
      headers: new Headers({ "content-type": "application/json" }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const { useCompanies } = await import("./useCompanies");

    const { result } = renderHook(() => useCompanies({ enabled: false }));

    await result.current.refresh();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
