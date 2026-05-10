import { scrubObject } from "@/lib/sanitize";

const DROPPED_VALUE = "[DROPPED]" as const;
const SCRUBBED_URL = "[SCRUBBED_URL]" as const;

const ALLOWED_BREADCRUMB_DATA_KEYS = new Set([
  "code",
  "durationMs",
  "elapsed_ms",
  "environment",
  "feature",
  "method",
  "name",
  "release",
  "requestId",
  "route",
  "service",
  "status",
  "statusCode",
]);

const URL_LIKE_DATA_KEYS = new Set(["route"]);
const FREE_TEXT_DATA_KEYS = new Set(["name"]);

export function scrubSentryEvent<T>(event: T): T {
  const scrubbed = scrubObject(event);
  if (!isRecord(scrubbed)) {
    return scrubbed as T;
  }

  return scrubSentryRecord(scrubbed) as T;
}

function scrubSentryRecord(event: Record<string, unknown>): Record<string, unknown> {
  const next = { ...event };
  if (isRecord(next.request)) {
    next.request = scrubRequest(next.request);
  }
  if (Array.isArray(next.breadcrumbs)) {
    next.breadcrumbs = next.breadcrumbs.map(scrubBreadcrumb);
  }
  return next;
}

function scrubRequest(request: Record<string, unknown>): Record<string, unknown> {
  const next = { ...request };
  if ("headers" in next) {
    next.headers = DROPPED_VALUE;
  }
  if (typeof next.url === "string") {
    next.url = scrubUrl(next.url);
  }
  if ("query_string" in next) {
    next.query_string = DROPPED_VALUE;
  }
  if ("cookies" in next) {
    next.cookies = DROPPED_VALUE;
  }
  if ("data" in next) {
    next.data = DROPPED_VALUE;
  }
  return next;
}

function scrubBreadcrumb(value: unknown): unknown {
  if (!isRecord(value)) {
    return value;
  }
  const next = { ...value };
  if (isRecord(next.data)) {
    const allowedData: Record<string, unknown> = {};
    for (const [key, entryValue] of Object.entries(next.data)) {
      if (ALLOWED_BREADCRUMB_DATA_KEYS.has(key)) {
        allowedData[key] = scrubAllowedBreadcrumbData(key, entryValue);
      }
    }
    next.data = allowedData;
  }
  return next;
}

function scrubAllowedBreadcrumbData(key: string, value: unknown): unknown {
  if (typeof value !== "string") {
    return scrubObject(value);
  }
  if (URL_LIKE_DATA_KEYS.has(key)) {
    return scrubUrl(value);
  }
  if (FREE_TEXT_DATA_KEYS.has(key)) {
    return "[SCRUBBED_TEXT]";
  }
  return scrubObject(value);
}

function scrubUrl(url: string): string {
  try {
    const parsed = url.startsWith("/")
      ? new URL(url, "https://local.invalid")
      : new URL(url);
    if (url.startsWith("/")) {
      return parsed.pathname;
    }
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return SCRUBBED_URL;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
