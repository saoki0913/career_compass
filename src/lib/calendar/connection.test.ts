import { beforeEach, describe, expect, it, vi } from "vitest";
import { GOOGLE_CALENDAR_SCOPES } from "@/lib/calendar/connection";

const {
  updateValuesMock,
  updateWhereMock,
  updateMock,
} = vi.hoisted(() => {
  const updateValuesMock = vi.fn();
  const updateWhereMock = vi.fn();
  const updateMock = vi.fn(() => ({
    set: vi.fn((values) => {
      updateValuesMock(values);
      return { where: updateWhereMock };
    }),
  }));

  return {
    updateValuesMock,
    updateWhereMock,
    updateMock,
  };
});

vi.mock("@/lib/db", () => ({
  db: {
    update: updateMock,
  },
}));

describe("calendar/connection helpers", () => {
  beforeEach(() => {
    updateValuesMock.mockReset();
    updateWhereMock.mockReset();
    updateWhereMock.mockResolvedValue(undefined);
    updateMock.mockClear();
  });

  it("marks Google as connected only when all scopes are present", async () => {
    const { buildCalendarConnectionStatus } = await import("@/lib/calendar/connection");

    const status = buildCalendarConnectionStatus({
      googleRefreshToken: "encrypted-refresh-token",
      googleGrantedScopes: JSON.stringify(GOOGLE_CALENDAR_SCOPES),
      googleCalendarEmail: "user@example.com",
      googleCalendarConnectedAt: new Date("2026-03-15T00:00:00.000Z"),
      googleCalendarNeedsReconnect: false,
    });

    expect(status.connected).toBe(true);
    expect(status.needsReconnect).toBe(false);
    expect(status.missingScopes).toEqual([]);
  });

  it("flags reconnect when scopes are missing", async () => {
    const { buildCalendarConnectionStatus } = await import("@/lib/calendar/connection");

    const status = buildCalendarConnectionStatus({
      googleRefreshToken: "encrypted-refresh-token",
      googleGrantedScopes: JSON.stringify([GOOGLE_CALENDAR_SCOPES[0]]),
      googleCalendarEmail: "user@example.com",
      googleCalendarConnectedAt: new Date("2026-03-15T00:00:00.000Z"),
      googleCalendarNeedsReconnect: false,
    });

    expect(status.connected).toBe(false);
    expect(status.needsReconnect).toBe(true);
    expect(status.missingScopes).toEqual(GOOGLE_CALENDAR_SCOPES.slice(1));
  });

  it("clears provider, tokens, and calendar selections on disconnect", async () => {
    const { clearGoogleCalendarConnection } = await import("@/lib/calendar/connection");

    await clearGoogleCalendarConnection("user-1");

    expect(updateMock).toHaveBeenCalledTimes(1);
    expect(updateValuesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "app",
        targetCalendarId: null,
        freebusyCalendarIds: null,
        googleAccessToken: null,
        googleRefreshToken: null,
        googleTokenExpiresAt: null,
        googleGrantedScopes: null,
        googleCalendarEmail: null,
        googleCalendarConnectedAt: null,
        googleCalendarNeedsReconnect: false,
      })
    );
  });
});
