import type { BaseMessage } from "./types";

export function safeParseJsonValue(value: unknown): unknown {
  if (value == null) return null;
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }
  return value;
}

export function parseOptionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

export function parseStringArray(
  value: unknown,
  trim = true,
  maxItems?: number,
): string[] {
  if (!Array.isArray(value)) return [];
  let result = value.filter((item): item is string => typeof item === "string");
  if (trim) {
    result = result.map((s) => s.trim()).filter(Boolean);
  }
  if (maxItems !== undefined) {
    result = result.slice(0, maxItems);
  }
  return result;
}

export function safeParseMessages<T extends BaseMessage = BaseMessage>(
  value: unknown,
  options?: { generateId?: (index: number) => string },
): T[] {
  const parsed = Array.isArray(value) ? value : safeParseJsonValue(value);
  if (!Array.isArray(parsed)) return [];

  const generateId = options?.generateId ?? (() => crypto.randomUUID());

  return parsed
    .filter(
      (msg): msg is { id?: string; role: string; content: string } =>
        !!msg &&
        typeof msg === "object" &&
        (msg.role === "user" || msg.role === "assistant") &&
        typeof msg.content === "string",
    )
    .map((msg, index) => ({
      id: msg.id || generateId(index),
      role: msg.role as "user" | "assistant",
      content: msg.content,
    })) as T[];
}
