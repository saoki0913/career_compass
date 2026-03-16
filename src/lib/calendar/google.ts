/**
 * Google Calendar API integration
 */

interface GoogleCalendarEvent {
  id: string;
  summary: string;
  start: { dateTime?: string; date?: string };
  end: { dateTime?: string; date?: string };
  htmlLink: string;
}

interface FreeBusySlot {
  start: string;
  end: string;
}

const APP_CALENDAR_PREFIXES = ["[就活Pass]", "[シューパス]", "[就活Compass]"] as const;
const DEFAULT_CALENDAR_NAME = "就活Pass";

export type AppCalendarEventKind = "deadline" | "work_block";

const APP_EVENT_KIND_LABEL: Record<AppCalendarEventKind, string> = {
  deadline: "締切",
  work_block: "作業",
};

export function stripAppCalendarPrefix(title: string) {
  return APP_CALENDAR_PREFIXES.reduce((current, prefix) => {
    const typedPrefixPattern = new RegExp(`^\\${prefix}(?:\\[(?:締切|作業)\\])?\\s*`);
    return current.replace(typedPrefixPattern, "");
  }, title).trim();
}

export function buildAppCalendarSummary(kind: AppCalendarEventKind, title: string) {
  const normalizedTitle = stripAppCalendarPrefix(title).trim();
  const label = APP_EVENT_KIND_LABEL[kind];
  return normalizedTitle ? `[就活Pass][${label}] ${normalizedTitle}` : `[就活Pass][${label}]`;
}

export function isAppCalendarEvent(summary?: string | null) {
  return APP_CALENDAR_PREFIXES.some((prefix) => summary?.startsWith(prefix));
}

export class GoogleCalendarScopeError extends Error {
  readonly details?: string;

  constructor(message: string, details?: string) {
    super(message);
    this.name = "GoogleCalendarScopeError";
    this.details = details;
  }
}

/**
 * List calendars for the user
 */
export async function listCalendars(accessToken: string) {
  const response = await fetch("https://www.googleapis.com/calendar/v3/users/me/calendarList", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) throw new Error("Failed to list calendars");
  const data = await response.json();
  return data.items || [];
}

/**
 * Get events from a calendar
 */
export async function getCalendarEvents(
  accessToken: string,
  calendarId: string = "primary",
  timeMin: string,
  timeMax: string
): Promise<GoogleCalendarEvent[]> {
  const params = new URLSearchParams({
    timeMin,
    timeMax,
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "100",
  });

  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!response.ok) throw new Error("Failed to fetch events");
  const data = await response.json();
  return data.items || [];
}

/**
 * Create a calendar event with the app prefix
 */
export async function createCalendarEvent(
  accessToken: string,
  calendarId: string = "primary",
  event: {
    kind: AppCalendarEventKind;
    entityId: string;
    title: string;
    startAt: string;
    endAt: string;
    description?: string;
  }
) {
  const summary = buildAppCalendarSummary(event.kind, event.title);

  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        summary,
        start: { dateTime: event.startAt },
        end: { dateTime: event.endAt },
        description: event.description || "就活Passで作成",
        extendedProperties: {
          private: {
            managedBy: "shukatsu-pass",
            entityType: event.kind,
            entityId: event.entityId,
          },
        },
      }),
    }
  );

  if (!response.ok) throw new Error("Failed to create event");
  return await response.json();
}

/**
 * Delete a calendar event (only app-managed events - replace mode)
 */
export async function deleteCalendarEvent(
  accessToken: string,
  calendarId: string = "primary",
  eventId: string
) {
  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${eventId}`,
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  if (!response.ok && response.status !== 404) throw new Error("Failed to delete event");
}

/**
 * Get free/busy information
 */
export async function getFreeBusy(
  accessToken: string,
  calendarIds: string[] = ["primary"],
  timeMin: string,
  timeMax: string
): Promise<FreeBusySlot[]> {
  const response = await fetch("https://www.googleapis.com/calendar/v3/freeBusy", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      timeMin,
      timeMax,
      items: calendarIds.map((id) => ({ id })),
    }),
  });

  if (!response.ok) throw new Error("Failed to get free/busy");
  const data = await response.json();
  const merged = calendarIds.flatMap((calendarId) => data.calendars?.[calendarId]?.busy || []);
  const sorted = merged
    .filter((slot: FreeBusySlot) => slot?.start && slot?.end)
    .sort((a: FreeBusySlot, b: FreeBusySlot) => new Date(a.start).getTime() - new Date(b.start).getTime());

  const normalized: FreeBusySlot[] = [];
  for (const slot of sorted) {
    const last = normalized[normalized.length - 1];
    if (!last) {
      normalized.push(slot);
      continue;
    }

    if (new Date(slot.start).getTime() <= new Date(last.end).getTime()) {
      if (new Date(slot.end).getTime() > new Date(last.end).getTime()) {
        last.end = slot.end;
      }
      continue;
    }

    normalized.push(slot);
  }

  return normalized;
}

/**
 * Suggest work blocks based on free/busy data
 * Find available 1-2 hour slots for ES work
 */
export function suggestWorkBlocks(
  busySlots: FreeBusySlot[],
  date: string,
  preferredDuration: number = 60 // minutes
): Array<{ start: string; end: string; title: string }> {
  const dayStart = new Date(`${date}T09:00:00+09:00`); // 9 AM JST
  const dayEnd = new Date(`${date}T21:00:00+09:00`); // 9 PM JST

  // Sort busy slots
  const sorted = [...busySlots].sort((a, b) =>
    new Date(a.start).getTime() - new Date(b.start).getTime()
  );

  // Find free slots
  const freeSlots: Array<{ start: Date; end: Date }> = [];
  let cursor = dayStart;

  for (const slot of sorted) {
    const busyStart = new Date(slot.start);
    const busyEnd = new Date(slot.end);

    if (cursor < busyStart && cursor < dayEnd) {
      freeSlots.push({ start: new Date(cursor), end: new Date(Math.min(busyStart.getTime(), dayEnd.getTime())) });
    }
    if (busyEnd > cursor) cursor = busyEnd;
  }

  if (cursor < dayEnd) {
    freeSlots.push({ start: new Date(cursor), end: dayEnd });
  }

  // Filter slots that are long enough and suggest up to 3
  const suggestions: Array<{ start: string; end: string; title: string }> = [];
  const titles = ["ES作成タイム", "企業研究タイム", "自己分析タイム"];

  for (const slot of freeSlots) {
    const durationMs = slot.end.getTime() - slot.start.getTime();
    const durationMin = durationMs / (1000 * 60);

    if (durationMin >= preferredDuration && suggestions.length < 3) {
      const endTime = new Date(slot.start.getTime() + preferredDuration * 60 * 1000);
      suggestions.push({
        start: slot.start.toISOString(),
        end: endTime.toISOString(),
        title: titles[suggestions.length] || "就活作業",
      });
    }
  }

  return suggestions;
}

/**
 * Refresh an expired access token using the refresh token
 */
export async function refreshAccessToken(refreshToken: string): Promise<{
  accessToken: string;
  expiresAt: Date;
}> {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error("Token refresh failed:", error);
    throw new Error("Token refresh failed");
  }

  const data = await response.json();
  return {
    accessToken: data.access_token,
    expiresAt: new Date(Date.now() + data.expires_in * 1000),
  };
}

/**
 * Create a new Google Calendar
 */
export async function createCalendar(
  accessToken: string,
  name: string = DEFAULT_CALENDAR_NAME
): Promise<{ id: string; summary: string }> {
  const response = await fetch(
    "https://www.googleapis.com/calendar/v3/calendars",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        summary: name,
        description: "就活Passで作成した就活用カレンダー",
        timeZone: "Asia/Tokyo",
      }),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    console.error("Failed to create calendar:", error);
    if (
      error.includes("ACCESS_TOKEN_SCOPE_INSUFFICIENT") ||
      error.includes("insufficientPermissions")
    ) {
      throw new GoogleCalendarScopeError("Google Calendar scope insufficient", error);
    }
    throw new Error("Failed to create calendar");
  }

  return await response.json();
}
