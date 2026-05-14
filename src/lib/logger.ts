/**
 * Structured logging utility that sanitizes sensitive data.
 * Prevents API keys, tokens, and stack traces from leaking into production logs.
 */

import { redactSensitive, scrubObject } from "@/lib/sanitize";

type SafeLogPrimitive = string | number | boolean | null | undefined;
type SafeLogValue = SafeLogPrimitive | SafeLogValue[] | { [key: string]: SafeLogValue };

export type SafeLogContext = {
  requestId?: string;
  route?: string;
  method?: string;
  status?: number;
  statusCode?: number;
  event?: string;
  eventType?: string;
  feature?: string;
  service?: string;
  provider?: string;
  plan?: string;
  code?: string;
  action?: string;
  count?: number;
  durationMs?: number;
  [key: string]: SafeLogValue;
};

interface SanitizedError {
  message: string;
  name?: string;
  code?: string;
  stack?: string;
}

function sanitizeError(error: unknown): SanitizedError {
  if (error instanceof Error) {
    const result: SanitizedError = {
      message: redactSensitive(error.message),
      name: error.name,
    };
    if ("code" in error && typeof (error as Record<string, unknown>).code === "string") {
      result.code = (error as Record<string, unknown>).code as string;
    }
    if (process.env.NODE_ENV === "development") {
      result.stack = error.stack ? redactSensitive(error.stack) : undefined;
    }
    return result;
  }
  if (typeof error === "string") {
    return { message: redactSensitive(error) };
  }
  return { message: "Unknown error" };
}

/**
 * Log an error with context, sanitizing sensitive data.
 * In production, stack traces are omitted and API keys are redacted.
 */
export function logError(context: string, error: unknown, extra?: Record<string, unknown>): void {
  const sanitized = sanitizeError(error);
  const payload: Record<string, unknown> = {
    context,
    ...sanitized,
  };
  if (extra) {
    Object.assign(payload, scrubObject(extra));
  }
  console.error(JSON.stringify(payload));
}

function logStructured(
  level: "info" | "warn",
  context: string,
  extra?: SafeLogContext,
): void {
  const payload: Record<string, unknown> = { context };
  if (extra) {
    Object.assign(payload, scrubObject(normalizeLogContext(extra)));
  }
  const line = JSON.stringify(payload);
  if (level === "warn") {
    console.warn(line);
    return;
  }
  console.info(line);
}

export function logInfo(context: string, extra?: SafeLogContext): void {
  logStructured("info", context, extra);
}

export function logWarn(context: string, extra?: SafeLogContext): void {
  logStructured("warn", context, extra);
}

function normalizeLogContext(extra: SafeLogContext): SafeLogContext {
  const normalized: SafeLogContext = { ...extra };
  for (const key of ["route", "url", "path"]) {
    const value = normalized[key];
    if (typeof value === "string") {
      normalized[key] = scrubUrlLikeValue(value);
    }
  }
  return normalized;
}

function scrubUrlLikeValue(value: string): string {
  try {
    const parsed = value.startsWith("/")
      ? new URL(value, "https://local.invalid")
      : new URL(value);
    return value.startsWith("/") ? parsed.pathname : `${parsed.origin}${parsed.pathname}`;
  } catch {
    return redactSensitive(value);
  }
}
