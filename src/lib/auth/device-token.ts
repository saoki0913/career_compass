/**
 * Legacy device token cleanup helpers.
 *
 * Guest identification now uses an HttpOnly cookie issued by the server.
 * These helpers only remove old localStorage state left by previous versions.
 */

const DEVICE_TOKEN_KEY = "ukarun_device_token";

/**
 * Check whether a legacy localStorage token still exists.
 */
export function hasDeviceToken(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  return localStorage.getItem(DEVICE_TOKEN_KEY) !== null;
}

/**
 * Clear the legacy token after cookie-based auth is active.
 */
export function clearDeviceToken(): void {
  if (typeof window === "undefined") {
    return;
  }
  localStorage.removeItem(DEVICE_TOKEN_KEY);
}
