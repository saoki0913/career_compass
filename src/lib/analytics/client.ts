/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Client-side analytics helper.
 *
 * - No-op when analytics is not configured.
 * - Avoid sending PII (email, ES text, etc.) to third parties.
 */

declare global {
  interface Window {
    gtag?: (...args: any[]) => void;
  }
}

export function trackEvent(eventName: string, params?: Record<string, unknown>) {
  if (typeof window === "undefined") return;

  // GA4 (gtag.js)
  if (typeof window.gtag === "function") {
    try {
      window.gtag("event", eventName, params ?? {});
    } catch {
      // ignore
    }
  }
}

