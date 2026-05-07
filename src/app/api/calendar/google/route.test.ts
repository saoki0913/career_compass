import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  getSessionMock,
  getValidGoogleCalendarAccessTokenMock,
  getFreeBusyMock,
  reconcileGoogleCalendarEventsMock,
} = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  getValidGoogleCalendarAccessTokenMock: vi.fn(),
  getFreeBusyMock: vi.fn(),
  reconcileGoogleCalendarEventsMock: vi.fn(),
}));

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers()),
}));

vi.mock("@/lib/auth", () => ({
  auth: {
    api: {
      getSession: getSessionMock,
    },
  },
}));

vi.mock("@/lib/calendar/connection", () => ({
  getValidGoogleCalendarAccessToken: getValidGoogleCalendarAccessTokenMock,
  parseStoredJsonArray: vi.fn((value: string | null) => (value ? JSON.parse(value) : [])),
}));

vi.mock("@/lib/calendar/google", () => ({
  getFreeBusy: getFreeBusyMock,
  suggestWorkBlocks: vi.fn(() => []),
}));

vi.mock("@/lib/calendar/sync", () => ({
  reconcileGoogleCalendarEvents: reconcileGoogleCalendarEventsMock,
}));

const csrfHeaders = {
  "content-type": "application/json",
  cookie: "csrf_token=test-csrf",
  "x-csrf-token": "test-csrf",
};

describe("api/calendar/google", () => {
  beforeEach(() => {
    getSessionMock.mockReset();
    getValidGoogleCalendarAccessTokenMock.mockReset();
    getFreeBusyMock.mockReset();
    reconcileGoogleCalendarEventsMock.mockReset();

    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    getValidGoogleCalendarAccessTokenMock.mockResolvedValue({
      accessToken: "access-token",
      settings: {
        targetCalendarId: "calendar-1",
        freebusyCalendarIds: JSON.stringify(["calendar-1"]),
      },
      status: { needsReconnect: false },
    });
  });

  it("keeps GET events read-only and requires POST for reconcile", async () => {
    const { GET } = await import("@/app/api/calendar/google/route");

    const response = await GET(
      new NextRequest("http://localhost:3000/api/calendar/google?action=events&start=2026-03-01&end=2026-03-02"),
    );
    const data = await response.json();

    expect(response.status).toBe(405);
    expect(data.error.code).toBe("CALENDAR_GOOGLE_EVENTS_POST_REQUIRED");
    expect(reconcileGoogleCalendarEventsMock).not.toHaveBeenCalled();
  });

  it("rejects POST reconcile before session lookup when CSRF is missing", async () => {
    const { POST } = await import("@/app/api/calendar/google/route");

    const response = await POST(
      new NextRequest("http://localhost:3000/api/calendar/google", {
        method: "POST",
        body: JSON.stringify({ start: "2026-03-01", end: "2026-03-02" }),
        headers: { "content-type": "application/json" },
      }),
    );
    const data = await response.json();

    expect(response.status).toBe(403);
    expect(data.error.code).toBe("CSRF_VALIDATION_FAILED");
    expect(getSessionMock).not.toHaveBeenCalled();
    expect(reconcileGoogleCalendarEventsMock).not.toHaveBeenCalled();
  });

  it("runs reconcile through CSRF-protected POST", async () => {
    const { POST } = await import("@/app/api/calendar/google/route");
    reconcileGoogleCalendarEventsMock.mockResolvedValue({
      externalEvents: [{ id: "google-event-1", summary: "説明会" }],
    });

    const response = await POST(
      new NextRequest("http://localhost:3000/api/calendar/google", {
        method: "POST",
        body: JSON.stringify({ start: "2026-03-01", end: "2026-03-02" }),
        headers: csrfHeaders,
      }),
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.events).toEqual([{ id: "google-event-1", summary: "説明会" }]);
    expect(reconcileGoogleCalendarEventsMock).toHaveBeenCalledWith(
      "user-1",
      "calendar-1",
      "2026-03-01",
      "2026-03-02",
    );
  });
});
