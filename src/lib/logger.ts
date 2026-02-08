/**
 * Structured logging utility that sanitizes sensitive data.
 * Prevents API keys, tokens, and stack traces from leaking into production logs.
 */

const SENSITIVE_PATTERNS = [
  /sk-[a-zA-Z0-9]{20,}/g, // OpenAI API keys
  /sk-ant-[a-zA-Z0-9-]{20,}/g, // Anthropic API keys
  /whsec_[a-zA-Z0-9]{20,}/g, // Stripe webhook secrets
  /Bearer\s+[a-zA-Z0-9._-]{20,}/g, // Bearer tokens
];

function redactSensitive(text: string): string {
  let result = text;
  for (const pattern of SENSITIVE_PATTERNS) {
    result = result.replace(pattern, "[REDACTED]");
  }
  return result;
}

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
    // Redact string values in extra data
    for (const [key, value] of Object.entries(extra)) {
      payload[key] = typeof value === "string" ? redactSensitive(value) : value;
    }
  }
  console.error(JSON.stringify(payload));
}
