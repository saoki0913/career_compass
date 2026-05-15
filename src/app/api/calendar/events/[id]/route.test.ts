import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  getSessionMock,
  dbSelectMock,
  dbDeleteMock,
  syncWorkBlockDeleteImmediatelyMock,
} = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  dbSelectMock: vi.fn(),
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
    select: dbSelectMock,
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
    dbSelectMock.mockReset();
    dbDeleteMock.mockReset();
    syncWorkBlockDeleteImmediatelyMock.mockReset();
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    syncWorkBlockDeleteImmediatelyMock.mockResolvedValue({ status: "skipped" });
  });

  it("returns 404 for missing or foreign-owned events without syncing Google", async () => {
    dbSelectMock.mockReturnValue({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn().mockResolvedValue([]),
        })),
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
    const order: string[] = [];
    dbSelectMock.mockReturnValue({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn().mockResolvedValue([
            {
              id: "event-1",
              googleCalendarId: "calendar-1",
              googleEventId: "google-event-1",
            },
          ]),
        })),
      })),
    });
    syncWorkBlockDeleteImmediatelyMock.mockImplementation(async () => {
      order.push("sync");
      return { status: "synced" };
    });
    dbDeleteMock.mockReturnValue({
      where: vi.fn(() => ({
        returning: vi.fn().mockImplementation(async () => {
          order.push("delete");
          return [{ id: "event-1" }];
        }),
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
    expect(order).toEqual(["sync", "delete"]);
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
    expect(dbSelectMock).not.toHaveBeenCalled();
    expect(dbDeleteMock).not.toHaveBeenCalled();
  });

  it("keeps the local event when Google delete retry cannot be queued", async () => {
    dbSelectMock.mockReturnValue({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn().mockResolvedValue([
            {
              id: "event-1",
              googleCalendarId: "calendar-1",
              googleEventId: "google-event-1",
            },
          ]),
        })),
      })),
    });
    syncWorkBlockDeleteImmediatelyMock.mockResolvedValueOnce({ status: "failed", error: "queue down" });

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
    expect(body.error.code).toBe("CALENDAR_EVENT_DELETE_RETRY_UNAVAILABLE");
    expect(dbDeleteMock).not.toHaveBeenCalled();
  });
});
