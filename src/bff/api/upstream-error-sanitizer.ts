const MAX_UPSTREAM_ERROR_SUMMARY_CHARS = 800;

function truncate(value: string): string {
  return value.length > MAX_UPSTREAM_ERROR_SUMMARY_CHARS
    ? `${value.slice(0, MAX_UPSTREAM_ERROR_SUMMARY_CHARS)}...`
    : value;
}

function collectUpstreamMessages(value: unknown, messages: string[] = []): string[] {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed) messages.push(trimmed);
    return messages;
  }

  if (Array.isArray(value)) {
    for (const item of value.slice(0, 5)) {
      collectUpstreamMessages(item, messages);
    }
    return messages;
  }

  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    collectUpstreamMessages(record.detail, messages);
    collectUpstreamMessages(record.error, messages);
    collectUpstreamMessages(record.errors, messages);
    collectUpstreamMessages(record.message, messages);
  }

  return messages;
}

export function summarizeUpstreamError(value: unknown): string | undefined {
  const messages = collectUpstreamMessages(value);
  if (messages.length === 0) return undefined;
  return truncate(messages.join(" | "));
}

export function sanitizeUpstreamUserMessage(_upstreamPayload: unknown, fallback: string): string {
  return fallback;
}
