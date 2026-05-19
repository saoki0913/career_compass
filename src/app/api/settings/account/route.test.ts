import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getSessionMock,
  dbSelectLimitMock,
  dbDeleteWhereMock,
  stripeCancelMock,
  revokeCalendarMock,
  revokeGoogleAccountTokensMock,
  requireUserMutationRequestMock,
} =
  vi.hoisted(() => ({
    getSessionMock: vi.fn(),
    dbSelectLimitMock: vi.fn(),
    dbDeleteWhereMock: vi.fn(),
    stripeCancelMock: vi.fn(),
    revokeCalendarMock: vi.fn(),
    revokeGoogleAccountTokensMock: vi.fn(),
    requireUserMutationRequestMock: vi.fn(),
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

vi.mock("@/lib/calendar/connection", () => ({
  revokeAndClearGoogleCalendarConnection: revokeCalendarMock,
}));

vi.mock("@/lib/auth/google-account-tokens", () => ({
  revokeGoogleAccountTokens: revokeGoogleAccountTokensMock,
}));

vi.mock("@/bff/api/mutation-guard", () => ({
  requireUserMutationRequest: requireUserMutationRequestMock,
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
    revokeCalendarMock.mockReset();
    revokeGoogleAccountTokensMock.mockReset();
    requireUserMutationRequestMock.mockReset();

    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    requireUserMutationRequestMock.mockResolvedValue({
      ok: true,
      session: { user: { id: "user-1" } },
    });
    revokeGoogleAccountTokensMock.mockResolvedValue(undefined);
    revokeCalendarMock.mockResolvedValue(undefined);
  });

  it("returns mutation guard response without deleting when CSRF or origin validation fails", async () => {
    requireUserMutationRequestMock.mockResolvedValueOnce({
      ok: false,
      response: new Response(
        JSON.stringify({ error: { code: "CSRF_VALIDATION_FAILED" } }),
        { status: 403, headers: { "Content-Type": "application/json" } },
      ),
    });

    const { DELETE } = await import("@/app/api/settings/account/route");
    const request = new Request(
      "http://localhost:3000/api/settings/account",
      { method: "DELETE" },
    );
    const response = await DELETE(request as never);

    expect(response.status).toBe(403);
    expect(stripeCancelMock).not.toHaveBeenCalled();
    expect(revokeGoogleAccountTokensMock).not.toHaveBeenCalled();
    expect(revokeCalendarMock).not.toHaveBeenCalled();
    expect(dbDeleteWhereMock).not.toHaveBeenCalled();
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
    expect(revokeGoogleAccountTokensMock).not.toHaveBeenCalled();
    expect(revokeCalendarMock).not.toHaveBeenCalled();
  });

  it("returns 502 and does NOT delete user when Google account token revoke fails", async () => {
    dbSelectLimitMock.mockResolvedValue([
      {
        stripeSubscriptionId: "sub_123",
        status: "canceled",
      },
    ]);
    revokeGoogleAccountTokensMock.mockRejectedValue(new Error("Google account revoke failed"));
    dbDeleteWhereMock.mockResolvedValue(undefined);

    const { DELETE } = await import("@/app/api/settings/account/route");
    const request = new Request(
      "http://localhost:3000/api/settings/account",
      { method: "DELETE" },
    );
    const response = await DELETE(request as never);

    expect(response.status).toBe(502);
    expect(revokeGoogleAccountTokensMock).toHaveBeenCalledWith("user-1");
    expect(revokeCalendarMock).not.toHaveBeenCalled();
    expect(dbDeleteWhereMock).not.toHaveBeenCalled();
  });

  it("returns 502 and does NOT delete user when Google Calendar revoke fails", async () => {
    dbSelectLimitMock.mockResolvedValue([
      {
        stripeSubscriptionId: "sub_123",
        status: "canceled",
      },
    ]);
    revokeCalendarMock.mockRejectedValue(new Error("Google revoke failed"));
    dbDeleteWhereMock.mockResolvedValue(undefined);

    const { DELETE } = await import("@/app/api/settings/account/route");
    const request = new Request(
      "http://localhost:3000/api/settings/account",
      { method: "DELETE" },
    );
    const response = await DELETE(request as never);

    expect(response.status).toBe(502);
    expect(revokeGoogleAccountTokensMock).toHaveBeenCalledWith("user-1");
    expect(revokeCalendarMock).toHaveBeenCalledWith("user-1");
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
    expect(revokeGoogleAccountTokensMock).toHaveBeenCalledWith("user-1");
    expect(revokeCalendarMock).toHaveBeenCalledWith("user-1");
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
    expect(revokeGoogleAccountTokensMock).toHaveBeenCalledWith("user-1");
    expect(revokeCalendarMock).toHaveBeenCalledWith("user-1");
    expect(dbDeleteWhereMock).toHaveBeenCalled();
  });
});
