import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getSessionMock,
  getGuestUserMock,
  logErrorMock,
} = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  getGuestUserMock: vi.fn(),
  logErrorMock: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  auth: {
    api: {
      getSession: getSessionMock,
    },
  },
}));

vi.mock("@/lib/auth/guest", () => ({
  getGuestUser: getGuestUserMock,
}));

vi.mock("@/lib/logger", () => ({
  logError: logErrorMock,
}));

describe("getHeadersIdentity", () => {
  beforeEach(() => {
    getSessionMock.mockReset();
    getGuestUserMock.mockReset();
    logErrorMock.mockReset();
  });

  it("returns null when session lookup fails without a guest token", async () => {
    const { getHeadersIdentity } = await import("@/app/api/_shared/request-identity");
    getSessionMock.mockRejectedValue(new Error("Failed query: select * from sessions where token = secret-token"));

    await expect(getHeadersIdentity(new Headers())).resolves.toBeNull();

    expect(getGuestUserMock).not.toHaveBeenCalled();
    expect(logErrorMock).toHaveBeenCalledWith(
      "request-identity:get-session",
      expect.any(Error),
      expect.objectContaining({
        hasDeviceToken: false,
      })
    );
  });

  it("falls back to guest identity when session lookup fails but a device token is present", async () => {
    const { getHeadersIdentity } = await import("@/app/api/_shared/request-identity");
    getSessionMock.mockRejectedValue(new Error("Failed to get session"));
    getGuestUserMock.mockResolvedValue({ id: "guest-1" });

    await expect(
      getHeadersIdentity(
        new Headers({
          "x-device-token": "device-token-123",
        })
      )
    ).resolves.toEqual({
      userId: null,
      guestId: "guest-1",
    });

    expect(getGuestUserMock).toHaveBeenCalledWith("device-token-123");
    expect(logErrorMock).toHaveBeenCalledWith(
      "request-identity:get-session",
      expect.any(Error),
      expect.objectContaining({
        hasDeviceToken: true,
      })
    );
  });
});
