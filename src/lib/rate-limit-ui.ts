"use client";

import { notifyRateLimit } from "@/lib/notifications";

export function handleRateLimitError(response: Response): boolean {
  if (response.status !== 429) return false;

  const retryAfter = response.headers.get("Retry-After");
  const seconds = retryAfter ? parseInt(retryAfter, 10) : 60;

  notifyRateLimit(seconds);

  return true;
}
