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
 * Create a calendar event with [ウカルン] prefix
 */
export async function createCalendarEvent(
  accessToken: string,
  calendarId: string = "primary",
  event: {
    title: string;
    startAt: string;
    endAt: string;
    description?: string;
  }
) {
  const summary = event.title.startsWith("[ウカルン]") ? event.title : `[ウカルン] ${event.title}`;

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
        description: event.description || "ウカルンで作成",
      }),
    }
  );

  if (!response.ok) throw new Error("Failed to create event");
  return await response.json();
}

/**
 * Delete a calendar event (only [ウカルン] events - replace mode)
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
  calendarId: string = "primary",
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
      items: [{ id: calendarId }],
    }),
  });

  if (!response.ok) throw new Error("Failed to get free/busy");
  const data = await response.json();
  return data.calendars?.[calendarId]?.busy || [];
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
 * Replace mode: Delete all [ウカルン] events in a range and recreate
 */
export async function replaceUkarunEvents(
  accessToken: string,
  calendarId: string,
  timeMin: string,
  timeMax: string,
  newEvents: Array<{ title: string; startAt: string; endAt: string }>
) {
  // Get existing [ウカルン] events
  const existing = await getCalendarEvents(accessToken, calendarId, timeMin, timeMax);
  const ukarunEvents = existing.filter(e => e.summary?.startsWith("[ウカルン]"));

  // Delete old [ウカルン] events
  for (const event of ukarunEvents) {
    await deleteCalendarEvent(accessToken, calendarId, event.id);
  }

  // Create new events
  const created = [];
  for (const event of newEvents) {
    const result = await createCalendarEvent(accessToken, calendarId, event);
    created.push(result);
  }

  return created;
}
