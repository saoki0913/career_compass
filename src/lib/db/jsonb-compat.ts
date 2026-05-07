export function parseJsonCompat(value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export function parseStringArrayCompat(value: unknown): string[] {
  const parsed = parseJsonCompat(value);
  if (!Array.isArray(parsed)) {
    return [];
  }
  return parsed.filter((item): item is string => typeof item === "string");
}

export function parseJsonRecordCompat(value: unknown): Record<string, unknown> | null {
  const parsed = parseJsonCompat(value);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return null;
  }
  return parsed as Record<string, unknown>;
}
