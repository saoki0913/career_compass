/**
 * Device Token Management (Client-side)
 *
 * Generates and manages a unique device identifier stored in localStorage.
 * Used for guest user identification and data migration upon login.
 */

const DEVICE_TOKEN_KEY = "ukarun_device_token";

/**
 * Generate a UUID v4
 */
function generateUUID(): string {
  return crypto.randomUUID();
}

/**
 * Get the device token from localStorage, creating one if it doesn't exist
 */
export function getDeviceToken(): string {
  if (typeof window === "undefined") {
    throw new Error("getDeviceToken can only be called on the client side");
  }

  let token = localStorage.getItem(DEVICE_TOKEN_KEY);

  if (!token) {
    token = generateUUID();
    localStorage.setItem(DEVICE_TOKEN_KEY, token);
  }

  return token;
}

/**
 * Check if a device token exists
 */
export function hasDeviceToken(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  return localStorage.getItem(DEVICE_TOKEN_KEY) !== null;
}

/**
 * Clear the device token (e.g., after successful migration to user account)
 */
export function clearDeviceToken(): void {
  if (typeof window === "undefined") {
    return;
  }
  localStorage.removeItem(DEVICE_TOKEN_KEY);
}
