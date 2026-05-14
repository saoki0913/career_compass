import type { Page, Route } from "@playwright/test";

export interface SseEvent {
  type: string;
  [key: string]: unknown;
}

function formatSseEvent(event: SseEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

export function buildSseStream(events: SseEvent[]): string {
  return events.map(formatSseEvent).join("");
}

export function buildProgressEvent(
  step: string,
  progress: number,
  label: string,
): SseEvent {
  return { type: "progress", step, progress, label };
}

export function buildStringChunkEvents(
  path: string,
  text: string,
  chunkSize = 20,
): SseEvent[] {
  const events: SseEvent[] = [];
  for (let i = 0; i < text.length; i += chunkSize) {
    events.push({
      type: "string_chunk",
      path,
      text: text.slice(i, i + chunkSize),
    });
  }
  return events;
}

export function buildFieldCompleteEvent(
  path: string,
  value: unknown,
): SseEvent {
  return { type: "field_complete", path, value };
}

export function buildCompleteEvent(
  data: Record<string, unknown>,
  key: "data" | "result" = "data",
): SseEvent {
  return { type: "complete", [key]: data };
}

export function buildErrorEvent(message: string): SseEvent {
  return { type: "error", message };
}

export function buildConversationStream(opts: {
  questionText: string;
  completeData: Record<string, unknown>;
  progressSteps?: Array<{ step: string; progress: number; label: string }>;
  fieldCompletes?: Array<{ path: string; value: unknown }>;
}): string {
  const events: SseEvent[] = [];

  if (opts.progressSteps) {
    for (const s of opts.progressSteps) {
      events.push(buildProgressEvent(s.step, s.progress, s.label));
    }
  }

  events.push(...buildStringChunkEvents("question", opts.questionText));

  if (opts.fieldCompletes) {
    for (const fc of opts.fieldCompletes) {
      events.push(buildFieldCompleteEvent(fc.path, fc.value));
    }
  }

  events.push(buildCompleteEvent(opts.completeData));

  return buildSseStream(events);
}

export async function mockSseRoute(
  page: Page,
  urlPattern: string,
  sseBody: string,
  method: "POST" | "GET" = "POST",
): Promise<void> {
  await page.route(urlPattern, async (route: Route) => {
    if (route.request().method() !== method) {
      return route.continue();
    }
    await route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body: sseBody,
    });
  });
}

export async function mockJsonRoute(
  page: Page,
  urlPattern: string,
  body: unknown,
  method: "GET" | "POST" | "PUT" | "DELETE" = "GET",
): Promise<void> {
  await page.route(urlPattern, async (route: Route) => {
    if (route.request().method() !== method) {
      return route.continue();
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  });
}
