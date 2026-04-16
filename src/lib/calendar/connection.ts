import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { calendarSettings } from "@/lib/db/schema";
import { refreshAccessToken } from "@/lib/calendar/google";
import { decrypt, encrypt } from "@/lib/crypto";

export const GOOGLE_CALENDAR_SCOPES = [
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.freebusy",
] as const;

/**
 * Defense-in-depth upper bound on refresh-token age.
 * Google refresh tokens do not expire on their own for active apps, but a
 * long-lived token that leaks is a long-lived credential. We force reconnect
 * after 365 days (D-4 in `docs/review/security/security_audit_2026-04-14.md`).
 */
export const GOOGLE_REFRESH_TOKEN_MAX_AGE_MS = 365 * 24 * 60 * 60 * 1000;

export interface CalendarConnectionStatus {
  connected: boolean;
  needsReconnect: boolean;
  connectedEmail: string | null;
  connectedAt: string | null;
  grantedScopes: string[];
  missingScopes: string[];
}

function decryptStoredToken(value: string | null): string | null {
  if (!value) return null;

  try {
    return decrypt(value);
  } catch {
    return value;
  }
}

export function parseStoredJsonArray(value: string | null): string[] {
  if (!value) return [];

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

export function buildCalendarConnectionStatus(settings: {
  googleRefreshToken: string | null;
  googleGrantedScopes: string | null;
  googleCalendarEmail: string | null;
  googleCalendarConnectedAt: Date | null;
  googleCalendarNeedsReconnect: boolean;
} | null): CalendarConnectionStatus {
  const grantedScopes = parseStoredJsonArray(settings?.googleGrantedScopes ?? null);
  const missingScopes = GOOGLE_CALENDAR_SCOPES.filter((scope) => !grantedScopes.includes(scope));
  const connected = !!settings?.googleRefreshToken && missingScopes.length === 0 && !settings.googleCalendarNeedsReconnect;

  return {
    connected,
    needsReconnect: !!settings?.googleCalendarNeedsReconnect || (!!settings?.googleRefreshToken && missingScopes.length > 0),
    connectedEmail: settings?.googleCalendarEmail ?? null,
    connectedAt: settings?.googleCalendarConnectedAt?.toISOString() ?? null,
    grantedScopes,
    missingScopes,
  };
}

export async function getCalendarSettingsRecord(userId: string) {
  const [settings] = await db
    .select()
    .from(calendarSettings)
    .where(eq(calendarSettings.userId, userId))
    .limit(1);

  return settings ?? null;
}

export async function ensureCalendarSettingsRecord(userId: string) {
  const existing = await getCalendarSettingsRecord(userId);
  if (existing) return existing;

  const now = new Date();
  const [created] = await db
    .insert(calendarSettings)
    .values({
      id: crypto.randomUUID(),
      userId,
      provider: "app",
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  return created;
}

export async function markCalendarReconnectNeeded(userId: string) {
  await db
    .update(calendarSettings)
    .set({
      googleCalendarNeedsReconnect: true,
      updatedAt: new Date(),
    })
    .where(eq(calendarSettings.userId, userId));
}

export async function clearCalendarReconnectNeeded(userId: string) {
  await db
    .update(calendarSettings)
    .set({
      googleCalendarNeedsReconnect: false,
      updatedAt: new Date(),
    })
    .where(eq(calendarSettings.userId, userId));
}

function isTokenExpired(
  accessToken: string | null,
  expiresAt: Date | null,
  now: Date,
): boolean {
  return !accessToken || (!!expiresAt && expiresAt.getTime() - now.getTime() < 5 * 60 * 1000);
}

/**
 * Get a valid Google Calendar access token, refreshing if expired.
 *
 * Uses CAS (Compare-and-Swap) with `updatedAt` as the version key to prevent
 * concurrent refresh races: if two sync jobs detect an expired token at the
 * same time, only the first CAS-update succeeds; the loser re-reads the DB
 * and returns the already-refreshed token.
 */
export async function getValidGoogleCalendarAccessToken(userId: string) {
  const settings = await getCalendarSettingsRecord(userId);
  const status = buildCalendarConnectionStatus(settings);
  const refreshToken = decryptStoredToken(settings?.googleRefreshToken ?? null);
  const accessToken = decryptStoredToken(settings?.googleAccessToken ?? null);

  if (!settings || !refreshToken || !status.connected) {
    return { accessToken: null, settings, status };
  }

  // D-4: Force reconnect if the stored refresh token is older than the safe age threshold.
  // For rows written before the `google_refresh_token_issued_at` column existed, fall back
  // to `googleCalendarConnectedAt` since every refresh-token acquisition path also updates
  // that timestamp.
  const refreshTokenReference =
    settings.googleRefreshTokenIssuedAt ?? settings.googleCalendarConnectedAt;
  if (
    refreshTokenReference &&
    Date.now() - refreshTokenReference.getTime() > GOOGLE_REFRESH_TOKEN_MAX_AGE_MS
  ) {
    await markCalendarReconnectNeeded(userId);
    const latest = await getCalendarSettingsRecord(userId);
    return {
      accessToken: null,
      settings: latest,
      status: buildCalendarConnectionStatus(latest),
    };
  }

  const now = new Date();
  if (!isTokenExpired(accessToken, settings.googleTokenExpiresAt, now)) {
    return { accessToken, settings, status };
  }

  // Token is expired — remember the current updatedAt for CAS
  const oldUpdatedAt = settings.updatedAt;

  try {
    // Refresh against Google (no DB lock held during external I/O)
    const refreshed = await refreshAccessToken(refreshToken);

    // CAS update: only succeeds if no other job refreshed in the meantime
    const [updated] = await db
      .update(calendarSettings)
      .set({
        googleAccessToken: encrypt(refreshed.accessToken),
        googleTokenExpiresAt: refreshed.expiresAt,
        googleCalendarNeedsReconnect: false,
        updatedAt: now,
      })
      .where(
        and(
          eq(calendarSettings.userId, userId),
          eq(calendarSettings.updatedAt, oldUpdatedAt),
        ),
      )
      .returning();

    if (!updated) {
      // CAS failed — another job refreshed first; re-read and return the latest token
      const latest = await getCalendarSettingsRecord(userId);
      const latestToken = decryptStoredToken(latest?.googleAccessToken ?? null);
      return {
        accessToken: latestToken,
        settings: latest,
        status: buildCalendarConnectionStatus(latest),
      };
    }

    const refreshedSettings = await getCalendarSettingsRecord(userId);
    return {
      accessToken: refreshed.accessToken,
      settings: refreshedSettings,
      status: buildCalendarConnectionStatus(refreshedSettings),
    };
  } catch {
    // Refresh failed — re-read to check if another job succeeded
    const latest = await getCalendarSettingsRecord(userId);
    const latestToken = decryptStoredToken(latest?.googleAccessToken ?? null);
    if (latestToken && latest && !isTokenExpired(latestToken, latest.googleTokenExpiresAt, new Date())) {
      // Another job refreshed successfully
      return {
        accessToken: latestToken,
        settings: latest,
        status: buildCalendarConnectionStatus(latest),
      };
    }

    // Genuinely failed — mark for reconnect
    await markCalendarReconnectNeeded(userId);
    const finalSettings = await getCalendarSettingsRecord(userId);
    return {
      accessToken: null,
      settings: finalSettings,
      status: buildCalendarConnectionStatus(finalSettings),
    };
  }
}

export async function storeGoogleCalendarTokens(params: {
  userId: string;
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date | null;
  grantedScopes: string[];
  email: string | null;
}) {
  const existing = await ensureCalendarSettingsRecord(params.userId);
  const now = new Date();

  // Only stamp `googleRefreshTokenIssuedAt` when Google issues a brand-new
  // refresh token. When `params.refreshToken` is null we are keeping the
  // existing token, so the original issuedAt must be preserved (otherwise we
  // would indefinitely extend the D-4 age check).
  const refreshTokenIssuedAtUpdate = params.refreshToken
    ? { googleRefreshTokenIssuedAt: now }
    : {};

  await db
    .update(calendarSettings)
    .set({
      googleAccessToken: encrypt(params.accessToken),
      googleRefreshToken: params.refreshToken ? encrypt(params.refreshToken) : existing.googleRefreshToken,
      googleTokenExpiresAt: params.expiresAt,
      googleGrantedScopes: JSON.stringify(params.grantedScopes),
      googleCalendarEmail: params.email,
      googleCalendarConnectedAt: now,
      googleCalendarNeedsReconnect: false,
      updatedAt: now,
      ...refreshTokenIssuedAtUpdate,
    })
    .where(and(eq(calendarSettings.userId, params.userId), eq(calendarSettings.id, existing.id)));
}

export async function clearGoogleCalendarConnection(userId: string) {
  await db
    .update(calendarSettings)
    .set({
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
      updatedAt: new Date(),
    })
    .where(eq(calendarSettings.userId, userId));
}
