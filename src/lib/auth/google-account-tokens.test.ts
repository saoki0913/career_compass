import { beforeEach, describe, expect, it, vi } from "vitest";

const { dbSelectMock, dbWhereMock, revokeGoogleOAuthTokenMock } = vi.hoisted(() => ({
  dbSelectMock: vi.fn(),
  dbWhereMock: vi.fn(),
  revokeGoogleOAuthTokenMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    select: dbSelectMock,
  },
}));

vi.mock("@/lib/db/schema", () => ({
  accounts: {
    accessToken: "accessToken",
    providerId: "providerId",
    refreshToken: "refreshToken",
    userId: "userId",
  },
}));

vi.mock("drizzle-orm", () => ({
  and: (...values: unknown[]) => ({ and: values }),
  eq: (...values: unknown[]) => ({ eq: values }),
}));

vi.mock("@/lib/calendar/google", () => ({
  revokeGoogleOAuthToken: revokeGoogleOAuthTokenMock,
}));

describe("revokeGoogleAccountTokens", () => {
  beforeEach(() => {
    vi.resetModules();
    dbSelectMock.mockReset();
    dbWhereMock.mockReset();
    revokeGoogleOAuthTokenMock.mockReset();
    revokeGoogleOAuthTokenMock.mockResolvedValue(undefined);

    dbSelectMock.mockReturnValue({
      from: vi.fn(() => ({
        where: dbWhereMock,
      })),
    });
  });

  it("revokes Google account refresh tokens before access tokens", async () => {
    dbWhereMock.mockResolvedValue([
      { accessToken: "access-1", refreshToken: "refresh-1" },
      { accessToken: "access-2", refreshToken: null },
      { accessToken: null, refreshToken: null },
    ]);

    const { revokeGoogleAccountTokens } = await import("./google-account-tokens");
    await revokeGoogleAccountTokens("user-1");

    expect(revokeGoogleOAuthTokenMock).toHaveBeenCalledTimes(2);
    expect(revokeGoogleOAuthTokenMock).toHaveBeenNthCalledWith(1, "refresh-1");
    expect(revokeGoogleOAuthTokenMock).toHaveBeenNthCalledWith(2, "access-2");
  });

  it("propagates revocation failures so local account deletion can stop", async () => {
    dbWhereMock.mockResolvedValue([{ accessToken: null, refreshToken: "refresh-1" }]);
    revokeGoogleOAuthTokenMock.mockRejectedValue(new Error("revoke failed"));

    const { revokeGoogleAccountTokens } = await import("./google-account-tokens");
    await expect(revokeGoogleAccountTokens("user-1")).rejects.toThrow("revoke failed");
  });
});
