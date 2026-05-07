import { scrubObject } from "@/lib/sanitize";

export function scrubSentryEvent<T>(event: T): T {
  return scrubObject(event) as T;
}
