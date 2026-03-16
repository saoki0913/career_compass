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

export async function getValidGoogleCalendarAccessToken(userId: string) {
  const settings = await getCalendarSettingsRecord(userId);
  const status = buildCalendarConnectionStatus(settings);
  const refreshToken = decryptStoredToken(settings?.googleRefreshToken ?? null);
  const accessToken = decryptStoredToken(settings?.googleAccessToken ?? null);

  if (!settings || !refreshToken || !status.connected) {
    return { accessToken: null, settings, status };
  }

  const now = new Date();
  const expiresAt = settings.googleTokenExpiresAt;
  const isExpired = !accessToken || (expiresAt && expiresAt.getTime() - now.getTime() < 5 * 60 * 1000);

  if (!isExpired) {
    return { accessToken, settings, status };
  }

  try {
    const refreshed = await refreshAccessToken(refreshToken);
    await db
      .update(calendarSettings)
      .set({
        googleAccessToken: encrypt(refreshed.accessToken),
        googleTokenExpiresAt: refreshed.expiresAt,
        googleCalendarNeedsReconnect: false,
        updatedAt: now,
      })
      .where(eq(calendarSettings.userId, userId));

    const refreshedSettings = await getCalendarSettingsRecord(userId);
    return {
      accessToken: refreshed.accessToken,
      settings: refreshedSettings,
      status: buildCalendarConnectionStatus(refreshedSettings),
    };
  } catch {
    await markCalendarReconnectNeeded(userId);
    const refreshedSettings = await getCalendarSettingsRecord(userId);
    return {
      accessToken: null,
      settings: refreshedSettings,
      status: buildCalendarConnectionStatus(refreshedSettings),
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
      updatedAt: new Date(),
    })
    .where(eq(calendarSettings.userId, userId));
}
