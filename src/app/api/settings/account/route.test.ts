import { beforeEach, describe, expect, it, vi } from "vitest";

const { getSessionMock, dbSelectLimitMock, dbDeleteWhereMock, stripeCancelMock } =
  vi.hoisted(() => ({
    getSessionMock: vi.fn(),
    dbSelectLimitMock: vi.fn(),
    dbDeleteWhereMock: vi.fn(),
    stripeCancelMock: vi.fn(),
  }));

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers()),
}));

vi.mock("@/lib/auth", () => ({
  auth: { api: { getSession: getSessionMock } },
}));

vi.mock("@/lib/logger", () => ({
  logError: vi.fn(),
}));

vi.mock("@/lib/stripe", () => ({
  stripe: {
    subscriptions: { cancel: stripeCancelMock },
  },
}));

vi.mock("@/lib/db", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: dbSelectLimitMock,
        })),
      })),
    })),
    delete: vi.fn(() => ({
      where: dbDeleteWhereMock,
    })),
  },
}));

vi.mock("@/lib/db/schema", () => ({
  users: { id: "id" },
  subscriptions: { userId: "userId" },
}));

describe("DELETE /api/settings/account", () => {
  beforeEach(() => {
    getSessionMock.mockReset();
    dbSelectLimitMock.mockReset();
    dbDeleteWhereMock.mockReset();
    stripeCancelMock.mockReset();

    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
  });

  it("returns 502 and does NOT delete user when Stripe cancel fails", async () => {
    dbSelectLimitMock.mockResolvedValue([
      {
        stripeSubscriptionId: "sub_123",
        status: "active",
      },
    ]);
    stripeCancelMock.mockRejectedValue(new Error("Stripe API error"));
    dbDeleteWhereMock.mockResolvedValue(undefined);

    const { DELETE } = await import("@/app/api/settings/account/route");
    const request = new Request(
      "http://localhost:3000/api/settings/account",
      { method: "DELETE" },
    );
    const response = await DELETE(request as never);

    expect(response.status).toBe(502);
    expect(dbDeleteWhereMock).not.toHaveBeenCalled();
  });

  it("deletes user when no active subscription", async () => {
    dbSelectLimitMock.mockResolvedValue([
      {
        stripeSubscriptionId: "sub_123",
        status: "canceled",
      },
    ]);
    dbDeleteWhereMock.mockResolvedValue(undefined);

    const { DELETE } = await import("@/app/api/settings/account/route");
    const request = new Request(
      "http://localhost:3000/api/settings/account",
      { method: "DELETE" },
    );
    const response = await DELETE(request as never);

    expect(response.status).toBe(200);
    expect(dbDeleteWhereMock).toHaveBeenCalled();
  });

  it("deletes user when subscription cancels successfully", async () => {
    dbSelectLimitMock.mockResolvedValue([
      {
        stripeSubscriptionId: "sub_123",
        status: "active",
      },
    ]);
    stripeCancelMock.mockResolvedValue({});
    dbDeleteWhereMock.mockResolvedValue(undefined);

    const { DELETE } = await import("@/app/api/settings/account/route");
    const request = new Request(
      "http://localhost:3000/api/settings/account",
      { method: "DELETE" },
    );
    const response = await DELETE(request as never);

    expect(response.status).toBe(200);
    expect(stripeCancelMock).toHaveBeenCalledWith("sub_123");
    expect(dbDeleteWhereMock).toHaveBeenCalled();
  });
});
