import { redactSensitive, scrubObject } from "@/lib/sanitize";

const DROPPED_VALUE = "[DROPPED]" as const;
const SCRUBBED_URL = "[SCRUBBED_URL]" as const;
const SCRUBBED_TEXT = "[SCRUBBED_TEXT]" as const;
const SAFE_EXCEPTION_MESSAGES = [
  /^[A-Za-z]*Error$/u,
  /^[A-Za-z]*Error: [A-Za-z_$][\w$]*(?: is not defined| is not a function)$/u,
  /^Cannot read properties of (?:undefined|null) \(reading '[A-Za-z_$][\w$]*'\)$/u,
  /^window is not defined$/u,
  /^document is not defined$/u,
];

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
  if (!isRecord(event)) {
    return scrubObject(event) as T;
  }

  return scrubSentryRecord(event) as T;
}

function scrubSentryRecord(event: Record<string, unknown>): Record<string, unknown> {
  const next = scrubObject(event) as Record<string, unknown>;
  if (isRecord(event.exception)) {
    next.exception = scrubException(event.exception);
  }
  if (isRecord(next.request)) {
    next.request = scrubRequest(next.request);
  }
  if (Array.isArray(next.breadcrumbs)) {
    next.breadcrumbs = next.breadcrumbs.map(scrubBreadcrumb);
  }
  return next;
}

function scrubException(exception: Record<string, unknown>): Record<string, unknown> {
  const next = { ...exception };
  if (Array.isArray(exception.values)) {
    next.values = exception.values.map(scrubExceptionValue);
  }
  return next;
}

function scrubExceptionValue(value: unknown): unknown {
  if (!isRecord(value)) {
    return scrubObject(value);
  }

  const next: Record<string, unknown> = {};
  for (const [key, entryValue] of Object.entries(value)) {
    if (key === "type" && typeof entryValue === "string") {
      next.type = redactSensitive(entryValue);
      continue;
    }
    if (key === "value" && typeof entryValue === "string") {
      next.value = scrubExceptionMessage(entryValue);
      continue;
    }
    if (key === "stacktrace" && isRecord(entryValue)) {
      next.stacktrace = scrubStacktrace(entryValue);
      continue;
    }
    next[key] = scrubObject(entryValue);
  }
  return next;
}

function scrubExceptionMessage(message: string): string {
  const redacted = redactSensitive(message);
  if (redacted !== message) {
    return redacted;
  }
  return SAFE_EXCEPTION_MESSAGES.some((pattern) => pattern.test(message))
    ? message
    : SCRUBBED_TEXT;
}

function scrubStacktrace(stacktrace: Record<string, unknown>): Record<string, unknown> {
  const next = { ...stacktrace };
  if (Array.isArray(stacktrace.frames)) {
    next.frames = stacktrace.frames.map(scrubFrame);
  }
  return next;
}

function scrubFrame(frame: unknown): unknown {
  if (!isRecord(frame)) {
    return scrubObject(frame);
  }

  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(frame)) {
    if (key === "vars") {
      next.vars = DROPPED_VALUE;
      continue;
    }
    if (key === "abs_path" && typeof value === "string") {
      next.abs_path = scrubUrl(value);
      continue;
    }
    if (typeof value === "string") {
      next[key] = redactSensitive(value);
      continue;
    }
    next[key] = scrubObject(value);
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
