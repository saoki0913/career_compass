/**
 * Structured logging utility that sanitizes sensitive data.
 * Prevents API keys, tokens, and stack traces from leaking into production logs.
 */

import { redactSensitive, scrubObject } from "@/lib/sanitize";

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
      result.stack = error.stack;
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
