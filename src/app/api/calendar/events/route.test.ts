import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getSessionMock = vi.fn();
const dbSelectMock = vi.fn();

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
  },
}));

vi.mock("@/lib/calendar/sync", () => ({
  enqueueWorkBlockUpsert: vi.fn(),
}));

describe("GET /api/calendar/events", () => {
  beforeEach(() => {
    getSessionMock.mockReset();
    dbSelectMock.mockReset();
    getSessionMock.mockResolvedValue({
      user: { id: "user-test-1" },
    });
    const chain = {
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          orderBy: vi.fn(() => Promise.resolve([])),
        })),
        leftJoin: vi.fn(() => ({
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
});
