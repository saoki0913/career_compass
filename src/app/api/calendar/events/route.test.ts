import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { readFile } from "node:fs/promises";

const getSessionMock = vi.fn();
const dbSelectMock = vi.fn();
const dbInsertMock = vi.fn();

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
    insert: dbInsertMock,
  },
}));

vi.mock("@/lib/calendar/sync", () => ({
  enqueueWorkBlockUpsert: vi.fn(),
  syncWorkBlockImmediately: vi.fn(),
}));

const csrfHeaders = {
  "content-type": "application/json",
  cookie: "csrf_token=test-csrf",
  "x-csrf-token": "test-csrf",
};

describe("GET /api/calendar/events", () => {
  beforeEach(() => {
    getSessionMock.mockReset();
    dbSelectMock.mockReset();
    getSessionMock.mockResolvedValue({
      user: { id: "user-test-1" },
    });
    dbInsertMock.mockReset();
    const chain = {
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          orderBy: vi.fn(() => Promise.resolve([])),
        })),
        innerJoin: vi.fn(() => ({
          where: vi.fn(() => ({
            orderBy: vi.fn(() => Promise.resolve([])),
          })),
        })),
      })),
    };
    dbSelectMock.mockImplementation(() => chain);
  });

  it("returns 200 with events and deadlines when session exists", async () => {
    const { GET } = await import("./route");
    const res = await GET(new NextRequest("http://localhost/api/calendar/events"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ events: [], deadlines: [] });
  });

  it("filters calendar deadlines to confirmed owned rows", async () => {
    const source = await readFile(new URL("./route.ts", import.meta.url), "utf8");

    expect(source).toContain("eq(deadlines.isConfirmed, true)");
    expect(source).toContain(".innerJoin(companies");
  });

  it("rejects creating an event with a deadline the caller does not own", async () => {
    const { POST } = await import("./route");
    dbSelectMock.mockImplementationOnce(() => ({
      from: vi.fn(() => ({
        innerJoin: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue([]),
          })),
        })),
      })),
    }));
    dbInsertMock.mockReturnValue({
      values: vi.fn(() => ({
        returning: vi.fn().mockResolvedValue([
          {
            id: "event-1",
            userId: "user-test-1",
            deadlineId: "deadline-foreign",
          },
        ]),
      })),
    });

    const request = new NextRequest("http://localhost/api/calendar/events", {
      method: "POST",
      body: JSON.stringify({
        type: "deadline",
        title: "面接",
        startAt: "2026-03-25T10:00:00.000Z",
        endAt: "2026-03-25T11:00:00.000Z",
        deadlineId: "deadline-foreign",
      }),
      headers: csrfHeaders,
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error.code).toBe("CALENDAR_EVENT_DEADLINE_NOT_FOUND");
  });

  it("rejects event creation before session lookup when CSRF is missing", async () => {
    const { POST } = await import("./route");
    const request = new NextRequest("http://localhost/api/calendar/events", {
      method: "POST",
      body: JSON.stringify({
        type: "work_block",
        title: "作業",
        startAt: "2026-03-25T10:00:00.000Z",
        endAt: "2026-03-25T11:00:00.000Z",
      }),
      headers: {
        "content-type": "application/json",
      },
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error.code).toBe("CSRF_VALIDATION_FAILED");
    expect(getSessionMock).not.toHaveBeenCalled();
  });
});
