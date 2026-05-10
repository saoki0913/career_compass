import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  getSessionMock,
  dbDeleteMock,
  syncWorkBlockDeleteImmediatelyMock,
} = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  dbDeleteMock: vi.fn(),
  syncWorkBlockDeleteImmediatelyMock: vi.fn(),
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

vi.mock("@/lib/db", () => ({
  db: {
    delete: dbDeleteMock,
  },
}));

vi.mock("@/lib/calendar/sync", () => ({
  syncWorkBlockDeleteImmediately: syncWorkBlockDeleteImmediatelyMock,
}));

const csrfHeaders = {
  cookie: "csrf_token=test-csrf",
  "x-csrf-token": "test-csrf",
};

describe("api/calendar/events/[id]", () => {
  beforeEach(() => {
    getSessionMock.mockReset();
    dbDeleteMock.mockReset();
    syncWorkBlockDeleteImmediatelyMock.mockReset();
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    syncWorkBlockDeleteImmediatelyMock.mockResolvedValue({ status: "skipped" });
  });

  it("returns 404 for missing or foreign-owned events without syncing Google", async () => {
    dbDeleteMock.mockReturnValue({
      where: vi.fn(() => ({
        returning: vi.fn().mockResolvedValue([]),
      })),
    });

    const { DELETE } = await import("./route");
    const response = await DELETE(
      new NextRequest("http://localhost/api/calendar/events/event-1", {
        method: "DELETE",
        headers: csrfHeaders,
      }),
      { params: Promise.resolve({ id: "event-1" }) },
    );
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error.code).toBe("CALENDAR_EVENT_NOT_FOUND");
    expect(syncWorkBlockDeleteImmediatelyMock).not.toHaveBeenCalled();
  });

  it("deletes by owner before syncing Google", async () => {
    dbDeleteMock.mockReturnValue({
      where: vi.fn(() => ({
        returning: vi.fn().mockResolvedValue([
          {
            id: "event-1",
            googleCalendarId: "calendar-1",
            googleEventId: "google-event-1",
          },
        ]),
      })),
    });

    const { DELETE } = await import("./route");
    const response = await DELETE(
      new NextRequest("http://localhost/api/calendar/events/event-1", {
        method: "DELETE",
        headers: csrfHeaders,
      }),
      { params: Promise.resolve({ id: "event-1" }) },
    );

    expect(response.status).toBe(200);
    expect(syncWorkBlockDeleteImmediatelyMock).toHaveBeenCalledWith({
      userId: "user-1",
      eventId: "event-1",
      googleCalendarId: "calendar-1",
      googleEventId: "google-event-1",
    });
  });

  it("returns 503 when session lookup fails", async () => {
    getSessionMock.mockRejectedValueOnce(new Error("session down"));

    const { DELETE } = await import("./route");
    const response = await DELETE(
      new NextRequest("http://localhost/api/calendar/events/event-1", {
        method: "DELETE",
        headers: csrfHeaders,
      }),
      { params: Promise.resolve({ id: "event-1" }) },
    );
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.error.code).toBe("AUTH_SESSION_UNAVAILABLE");
    expect(dbDeleteMock).not.toHaveBeenCalled();
  });
});
