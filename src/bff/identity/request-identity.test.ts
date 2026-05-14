import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getSessionMock,
  getGuestUserMock,
  readGuestDeviceTokenFromCookieHeaderMock,
  logErrorMock,
} = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  getGuestUserMock: vi.fn(),
  readGuestDeviceTokenFromCookieHeaderMock: vi.fn(),
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

vi.mock("@/lib/auth/guest-cookie", () => ({
  readGuestDeviceTokenFromCookieHeader: readGuestDeviceTokenFromCookieHeaderMock,
}));

vi.mock("@/lib/logger", () => ({
  logError: logErrorMock,
}));

describe("getHeadersIdentity", () => {
  beforeEach(() => {
    getSessionMock.mockReset();
    getGuestUserMock.mockReset();
    readGuestDeviceTokenFromCookieHeaderMock.mockReset();
    logErrorMock.mockReset();
  });

  it("returns null when session lookup fails without a guest token", async () => {
    const { getHeadersIdentity } = await import("@/bff/identity/request-identity");
    getSessionMock.mockRejectedValue(new Error("Failed query: select * from sessions where token = secret-token"));

    await expect(getHeadersIdentity(new Headers())).resolves.toBeNull();

    expect(getGuestUserMock).not.toHaveBeenCalled();
    expect(logErrorMock).toHaveBeenCalledWith(
      "request-identity:get-session",
      expect.any(Error),
      expect.objectContaining({
        hasGuestDeviceCookie: false,
        hasSessionCookie: false,
      })
    );
  });

  it("ignores a public x-device-token header when session lookup fails", async () => {
    const { getHeadersIdentity } = await import("@/bff/identity/request-identity");
    getSessionMock.mockRejectedValue(new Error("Failed to get session"));
    readGuestDeviceTokenFromCookieHeaderMock.mockReturnValue(null);

    await expect(
      getHeadersIdentity(
        new Headers({
          "x-device-token": "device-token-123",
        }),
      )
    ).resolves.toBeNull();

    expect(getGuestUserMock).not.toHaveBeenCalled();
    expect(logErrorMock).toHaveBeenCalledWith(
      "request-identity:get-session",
      expect.any(Error),
      expect.objectContaining({
        hasGuestDeviceCookie: false,
        hasSessionCookie: false,
      })
    );
  });

  it("throws in strict mode when session lookup fails even if a guest token is present", async () => {
    const { getHeadersIdentity, RequestIdentitySessionError } = await import("@/bff/identity/request-identity");
    getSessionMock.mockRejectedValue(new Error("Failed to get session"));
    readGuestDeviceTokenFromCookieHeaderMock.mockReturnValue("cookie-device-token");

    await expect(
      getHeadersIdentity(
        new Headers({
          cookie: "guest_device_token=cookie-device-token",
        }),
        { sessionErrorMode: "throw" },
      )
    ).rejects.toBeInstanceOf(RequestIdentitySessionError);

    expect(getGuestUserMock).not.toHaveBeenCalled();
  });

  it("prefers the HttpOnly guest cookie and ignores a public x-device-token header by default", async () => {
    const { getHeadersIdentity } = await import("@/bff/identity/request-identity");
    getSessionMock.mockResolvedValue(null);
    readGuestDeviceTokenFromCookieHeaderMock.mockReturnValue("cookie-device-token");
    getGuestUserMock.mockResolvedValue({ id: "guest-cookie" });

    await expect(
      getHeadersIdentity(
        new Headers({
          cookie: "guest_device_token=cookie-device-token",
          "x-device-token": "header-device-token",
        })
      )
    ).resolves.toEqual({
      kind: "guest",
      type: "guest",
      userId: null,
      guestId: "guest-cookie",
    });

    expect(getGuestUserMock).toHaveBeenCalledWith("cookie-device-token");
  });

  it("returns the active user identity and ignores guest tokens when a session exists", async () => {
    const { getHeadersIdentity } = await import("@/bff/identity/request-identity");
    getSessionMock.mockResolvedValue({
      user: { id: "user-1", role: "admin", banned: false },
    });
    readGuestDeviceTokenFromCookieHeaderMock.mockReturnValue("cookie-device-token");

    await expect(
      getHeadersIdentity(
        new Headers({
          cookie: "better-auth.session_token=session-token; guest_device_token=cookie-device-token",
          "x-device-token": "header-device-token",
        }),
      )
    ).resolves.toEqual({
      kind: "user",
      type: "user",
      userId: "user-1",
      guestId: null,
      role: "admin",
      banned: false,
    });

    expect(getGuestUserMock).not.toHaveBeenCalled();
  });

  it("rejects a currently banned user session", async () => {
    const { getHeadersIdentity } = await import("@/bff/identity/request-identity");
    getSessionMock.mockResolvedValue({
      user: { id: "user-1", role: "user", banned: true, banExpires: null },
    });

    await expect(
      getHeadersIdentity(
        new Headers({
          cookie: "better-auth.session_token=session-token",
        })
      )
    ).resolves.toBeNull();

    expect(getGuestUserMock).not.toHaveBeenCalled();
  });

  it("fails closed when session lookup fails for a request with a Better Auth cookie", async () => {
    const { getHeadersIdentity, RequestIdentitySessionError } = await import("@/bff/identity/request-identity");
    getSessionMock.mockRejectedValue(new Error("Database unavailable"));
    readGuestDeviceTokenFromCookieHeaderMock.mockReturnValue("cookie-device-token");

    await expect(
      getHeadersIdentity(
        new Headers({
          cookie: "better-auth.session_token=session-token; guest_device_token=cookie-device-token",
        })
      )
    ).rejects.toBeInstanceOf(RequestIdentitySessionError);

    expect(getGuestUserMock).not.toHaveBeenCalled();
  });

  it("does not accept a public x-device-token header", async () => {
    const { getHeadersIdentity } = await import("@/bff/identity/request-identity");
    getSessionMock.mockResolvedValue(null);
    readGuestDeviceTokenFromCookieHeaderMock.mockReturnValue(null);

    await expect(
      getHeadersIdentity(
        new Headers({
          "x-device-token": "header-device-token",
        })
      )
    ).resolves.toBeNull();

    expect(getGuestUserMock).not.toHaveBeenCalled();
  });
});
