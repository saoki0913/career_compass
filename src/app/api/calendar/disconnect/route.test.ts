import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { getSessionMock, csrfMock, revokeCalendarMock, cancelJobsMock } = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  csrfMock: vi.fn(),
  revokeCalendarMock: vi.fn(),
  cancelJobsMock: vi.fn(),
}));

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers()),
}));

vi.mock("@/lib/auth", () => ({
  auth: { api: { getSession: getSessionMock } },
}));

vi.mock("@/lib/csrf", () => ({
  getCsrfFailureReason: csrfMock,
}));

vi.mock("@/lib/calendar/connection", () => ({
  revokeAndClearGoogleCalendarConnection: revokeCalendarMock,
}));

vi.mock("@/lib/calendar/sync", () => ({
  cancelPendingCalendarSyncJobsForUser: cancelJobsMock,
}));

describe("POST /api/calendar/disconnect", () => {
  beforeEach(() => {
    getSessionMock.mockReset();
    csrfMock.mockReset();
    revokeCalendarMock.mockReset();
    cancelJobsMock.mockReset();

    csrfMock.mockReturnValue(null);
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    revokeCalendarMock.mockResolvedValue(undefined);
    cancelJobsMock.mockResolvedValue(undefined);
  });

  it("revokes Google Calendar tokens before canceling local sync jobs", async () => {
    const { POST } = await import("./route");
    const response = await POST(new NextRequest("http://localhost:3000/api/calendar/disconnect", {
      method: "POST",
    }));

    expect(response.status).toBe(200);
    expect(revokeCalendarMock).toHaveBeenCalledWith("user-1");
    expect(cancelJobsMock).toHaveBeenCalledWith("user-1");
  });

  it("does not cancel local jobs when Google revoke fails", async () => {
    revokeCalendarMock.mockRejectedValue(new Error("Google revoke failed"));

    const { POST } = await import("./route");
    const response = await POST(new NextRequest("http://localhost:3000/api/calendar/disconnect", {
      method: "POST",
    }));

    expect(response.status).toBe(502);
    expect(cancelJobsMock).not.toHaveBeenCalled();
  });
});
