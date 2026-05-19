import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  authGetSessionMock,
  getGuestUserMock,
  readGuestDeviceTokenFromCookieHeaderMock,
  dbSelectMock,
  dbInsertValuesMock,
} = vi.hoisted(() => ({
  authGetSessionMock: vi.fn(),
  getGuestUserMock: vi.fn(),
  readGuestDeviceTokenFromCookieHeaderMock: vi.fn(),
  dbSelectMock: vi.fn(),
  dbInsertValuesMock: vi.fn(),
}));

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers()),
}));

vi.mock("@/lib/auth", () => ({
  auth: {
    api: {
      getSession: authGetSessionMock,
    },
  },
}));

vi.mock("@/lib/auth/guest", () => ({
  getGuestUser: getGuestUserMock,
}));

vi.mock("@/lib/auth/guest-cookie", () => ({
  readGuestDeviceTokenFromCookieHeader: readGuestDeviceTokenFromCookieHeaderMock,
}));

vi.mock("@/lib/db", () => ({
  db: {
    select: dbSelectMock,
    insert: vi.fn(() => ({
      values: dbInsertValuesMock,
    })),
  },
}));

function makeThenableQuery(result: unknown) {
  type Query = {
    where: (...args: unknown[]) => Query;
    orderBy: (...args: unknown[]) => Query;
    limit: (...args: unknown[]) => Query;
  } & PromiseLike<unknown>;

  const query: Partial<Query> = {};
  query.where = vi.fn(() => query as Query);
  query.orderBy = vi.fn(() => query as Query);
  query.limit = vi.fn(() => query as Query);
  query.then = ((resolve, reject) => Promise.resolve(result).then(resolve, reject)) as Query["then"];
  return query as Query;
}

describe("api/notifications GET", () => {
  beforeEach(() => {
    authGetSessionMock.mockReset();
    getGuestUserMock.mockReset();
    readGuestDeviceTokenFromCookieHeaderMock.mockReset();
    dbSelectMock.mockReset();
    dbInsertValuesMock.mockReset();

    authGetSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    getGuestUserMock.mockResolvedValue(null);
    readGuestDeviceTokenFromCookieHeaderMock.mockReturnValue(null);
  });

  it("returns unreadCount from the aggregate count query", async () => {
    const notifications = [
      {
        id: "notification-1",
        userId: "user-1",
        guestId: null,
        type: "daily_summary",
        title: "今日のサマリー",
        message: "message",
        data: null,
        isRead: false,
        createdAt: new Date("2026-03-27T00:00:00.000Z"),
        expiresAt: null,
      },
    ];
    const unreadCountRows = [{ unreadCount: 3 }];

    const selectResults = [notifications, unreadCountRows];
    let selectCallIndex = 0;
    dbSelectMock.mockImplementation(() => ({
      from: vi.fn(() => makeThenableQuery(selectResults[selectCallIndex++] ?? [])),
    }));

    const { GET } = await import("@/app/api/notifications/route");
    const request = new NextRequest("http://localhost:3000/api/notifications?limit=10");
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.notifications).toHaveLength(1);
    expect(data.notifications[0].userId).toBeUndefined();
    expect(data.notifications[0].guestId).toBeUndefined();
    expect(data.unreadCount).toBe(3);
  });

  it("clamps invalid limits and returns guest-owned notifications without owner ids", async () => {
    authGetSessionMock.mockResolvedValue(null);
    readGuestDeviceTokenFromCookieHeaderMock.mockReturnValue("device-token");
    getGuestUserMock.mockResolvedValue({ id: "guest-1" });

    const notifications = [
      {
        id: "notification-guest",
        userId: null,
        guestId: "guest-1",
        type: "daily_summary",
        title: "今日のサマリー",
        message: "message",
        data: null,
        isRead: false,
        createdAt: new Date("2026-03-27T00:00:00.000Z"),
        expiresAt: null,
      },
    ];
    const unreadCountRows = [{ unreadCount: 1 }];
    const selectResults = [notifications, unreadCountRows];
    let selectCallIndex = 0;
    dbSelectMock.mockImplementation(() => ({
      from: vi.fn(() => {
        return makeThenableQuery(selectResults[selectCallIndex++] ?? []);
      }),
    }));

    const { GET } = await import("@/app/api/notifications/route");
    const request = new NextRequest("http://localhost:3000/api/notifications?limit=-1", {
      headers: {
        cookie: "guest_device_token=device-token",
      },
    });
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.notifications).toEqual([
      expect.objectContaining({
        id: "notification-guest",
        type: "daily_summary",
      }),
    ]);
    expect(data.notifications[0].userId).toBeUndefined();
    expect(data.notifications[0].guestId).toBeUndefined();
  });

  it("rejects client-created billing status notifications", async () => {
    const { POST } = await import("@/app/api/notifications/route");
    const request = new NextRequest("http://localhost:3000/api/notifications", {
      method: "POST",
      body: JSON.stringify({
        type: "billing_status",
        title: "お支払い",
        message: "message",
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toMatchObject({
      code: "NOTIFICATION_INVALID_TYPE",
      userMessage: "無効な通知タイプです。",
    });
    expect(data.requestId).toBeTruthy();
    expect(dbInsertValuesMock).not.toHaveBeenCalled();
  });

  it("creates notifications without returning owner ids", async () => {
    const inserted = {
      id: "notification-created",
      userId: "user-1",
      guestId: null,
      type: "daily_summary",
      title: "今日のサマリー",
      message: "message",
      data: null,
      isRead: false,
      createdAt: new Date("2026-03-27T00:00:00.000Z"),
      expiresAt: null,
    };
    dbInsertValuesMock.mockReturnValue({
      returning: vi.fn(async () => [inserted]),
    });

    const { POST } = await import("@/app/api/notifications/route");
    const request = new NextRequest("http://localhost:3000/api/notifications", {
      method: "POST",
      body: JSON.stringify({
        type: "daily_summary",
        title: "今日のサマリー",
        message: "message",
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.notification).toEqual(
      expect.objectContaining({
        id: "notification-created",
        type: "daily_summary",
      }),
    );
    expect(data.notification.userId).toBeUndefined();
    expect(data.notification.guestId).toBeUndefined();
  });
});
