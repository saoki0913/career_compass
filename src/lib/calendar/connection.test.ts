import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  GOOGLE_CALENDAR_SCOPES,
  GOOGLE_REFRESH_TOKEN_MAX_AGE_MS,
} from "@/lib/calendar/connection";

type SettingsRow = {
  id: string;
  userId: string;
  googleAccessToken: string | null;
  googleRefreshToken: string | null;
  googleTokenExpiresAt: Date | null;
  googleGrantedScopes: string | null;
  googleCalendarEmail: string | null;
  googleCalendarConnectedAt: Date | null;
  googleCalendarNeedsReconnect: boolean;
  googleRefreshTokenIssuedAt: Date | null;
  updatedAt: Date;
};

const {
  selectLimitMock,
  updateValuesMock,
  updateWhereMock,
  updateReturningMock,
  refreshAccessTokenMock,
} = vi.hoisted(() => ({
  selectLimitMock: vi.fn(),
  updateValuesMock: vi.fn(),
  updateWhereMock: vi.fn(),
  updateReturningMock: vi.fn(),
  refreshAccessTokenMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: selectLimitMock,
        })),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn((values: Record<string, unknown>) => {
        updateValuesMock(values);
        return {
          where: vi.fn((...whereArgs: unknown[]) => {
            updateWhereMock(...whereArgs);
            return {
              returning: updateReturningMock,
            };
          }),
        };
      }),
    })),
  },
}));

vi.mock("@/lib/calendar/google", () => ({
  refreshAccessToken: refreshAccessTokenMock,
}));

vi.mock("@/lib/crypto", () => ({
  decrypt: (value: string) => (value ? `dec:${value}` : value),
  encrypt: (value: string) => (value ? `enc:${value}` : value),
}));

function baseSettings(overrides: Partial<SettingsRow> = {}): SettingsRow {
  return {
    id: "settings-1",
    userId: "user-1",
    googleAccessToken: "enc:existing-access",
    googleRefreshToken: "enc:existing-refresh",
    googleTokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
    googleGrantedScopes: JSON.stringify(GOOGLE_CALENDAR_SCOPES),
    googleCalendarEmail: "user@example.com",
    googleCalendarConnectedAt: new Date("2026-03-15T00:00:00.000Z"),
    googleCalendarNeedsReconnect: false,
    googleRefreshTokenIssuedAt: new Date("2026-03-15T00:00:00.000Z"),
    updatedAt: new Date("2026-03-15T00:00:00.000Z"),
    ...overrides,
  };
}

describe("calendar/connection helpers", () => {
  beforeEach(() => {
    selectLimitMock.mockReset();
    updateValuesMock.mockReset();
    updateWhereMock.mockReset();
    updateReturningMock.mockReset();
    refreshAccessTokenMock.mockReset();

    updateReturningMock.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.useRealTimers();
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

  it("clears provider, tokens, calendar selections and the issuedAt timestamp on disconnect", async () => {
    const { clearGoogleCalendarConnection } = await import("@/lib/calendar/connection");

    await clearGoogleCalendarConnection("user-1");

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
        googleRefreshTokenIssuedAt: null,
      })
    );
  });

  it("forces reconnect when the stored refresh token is older than the 365-day threshold (D-4)", async () => {
    const now = new Date("2027-04-16T00:00:00.000Z");
    vi.useFakeTimers();
    vi.setSystemTime(now);

    const staleIssuedAt = new Date(now.getTime() - GOOGLE_REFRESH_TOKEN_MAX_AGE_MS - 60_000);
    const staleSettings = baseSettings({
      googleRefreshTokenIssuedAt: staleIssuedAt,
      googleCalendarConnectedAt: staleIssuedAt,
    });

    // getCalendarSettingsRecord -> stale
    // markCalendarReconnectNeeded is an update (not select)
    // getCalendarSettingsRecord after the update -> same row with needsReconnect=true
    selectLimitMock
      .mockResolvedValueOnce([staleSettings])
      .mockResolvedValueOnce([{ ...staleSettings, googleCalendarNeedsReconnect: true }]);

    const { getValidGoogleCalendarAccessToken } = await import("@/lib/calendar/connection");
    const result = await getValidGoogleCalendarAccessToken("user-1");

    expect(result.accessToken).toBeNull();
    expect(result.status.needsReconnect).toBe(true);
    expect(updateValuesMock).toHaveBeenCalledWith(
      expect.objectContaining({ googleCalendarNeedsReconnect: true })
    );
    // Must not attempt to refresh against Google when we're forcing reconnect
    expect(refreshAccessTokenMock).not.toHaveBeenCalled();
  });

  it("does not force reconnect when issuedAt + connectedAt are within the 365-day threshold", async () => {
    const now = new Date("2026-04-16T00:00:00.000Z");
    vi.useFakeTimers();
    vi.setSystemTime(now);

    const freshSettings = baseSettings({
      googleAccessToken: "enc:fresh-access",
      googleTokenExpiresAt: new Date(now.getTime() + 60 * 60 * 1000),
      googleRefreshTokenIssuedAt: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
    });

    selectLimitMock.mockResolvedValueOnce([freshSettings]);

    const { getValidGoogleCalendarAccessToken } = await import("@/lib/calendar/connection");
    const result = await getValidGoogleCalendarAccessToken("user-1");

    expect(result.accessToken).toBe("dec:enc:fresh-access");
    // No update should have fired for the reconnect path
    expect(updateValuesMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ googleCalendarNeedsReconnect: true })
    );
    expect(refreshAccessTokenMock).not.toHaveBeenCalled();
  });

  it("records googleRefreshTokenIssuedAt only when Google issues a new refresh token", async () => {
    const existing = baseSettings({ googleRefreshTokenIssuedAt: null });
    // ensureCalendarSettingsRecord -> getCalendarSettingsRecord path
    selectLimitMock.mockResolvedValueOnce([existing]);

    const { storeGoogleCalendarTokens } = await import("@/lib/calendar/connection");
    await storeGoogleCalendarTokens({
      userId: "user-1",
      accessToken: "new-access",
      refreshToken: "new-refresh",
      expiresAt: new Date("2026-04-16T01:00:00.000Z"),
      grantedScopes: [...GOOGLE_CALENDAR_SCOPES],
      email: "user@example.com",
    });

    const lastCall = updateValuesMock.mock.calls.at(-1)?.[0] as
      | Record<string, unknown>
      | undefined;
    expect(lastCall).toBeDefined();
    expect(lastCall).toHaveProperty("googleRefreshTokenIssuedAt");
    expect(lastCall?.googleRefreshTokenIssuedAt).toBeInstanceOf(Date);
  });

  it("preserves the previous googleRefreshTokenIssuedAt when no new refresh token is provided", async () => {
    const existing = baseSettings({
      googleRefreshTokenIssuedAt: new Date("2026-03-15T00:00:00.000Z"),
    });
    selectLimitMock.mockResolvedValueOnce([existing]);

    const { storeGoogleCalendarTokens } = await import("@/lib/calendar/connection");
    await storeGoogleCalendarTokens({
      userId: "user-1",
      accessToken: "new-access",
      refreshToken: null,
      expiresAt: new Date("2026-04-16T01:00:00.000Z"),
      grantedScopes: [...GOOGLE_CALENDAR_SCOPES],
      email: "user@example.com",
    });

    const lastCall = updateValuesMock.mock.calls.at(-1)?.[0] as
      | Record<string, unknown>
      | undefined;
    expect(lastCall).toBeDefined();
    // When no new refresh token is provided, issuedAt must NOT be in the set
    // payload so the existing DB value is preserved.
    expect(lastCall).not.toHaveProperty("googleRefreshTokenIssuedAt");
  });
});
