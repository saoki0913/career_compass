export function serializeOrNull<T>(value: T | null | undefined): T | null {
  return value ?? null;
}
