import { appPaths, type AppPath } from "@/lib/routes/app-routes";

const SAFE_RETURN_PATH_REGEX = /^\/(?!\/)/;

export function getSafeRelativeReturnPath(value: string | null | undefined, fallback = "/dashboard"): string {
  const candidate = value?.trim();
  if (!candidate) {
    return fallback;
  }

  if (!SAFE_RETURN_PATH_REGEX.test(candidate)) {
    return fallback;
  }

  if (candidate.includes("\u0000") || candidate.includes("\r") || candidate.includes("\n")) {
    return fallback;
  }

  try {
    const resolved = new URL(candidate, "https://www.shupass.jp");
    if (resolved.origin !== "https://www.shupass.jp") {
      return fallback;
    }
    return `${resolved.pathname}${resolved.search}${resolved.hash}`;
  } catch {
    return fallback;
  }
}

const postAuthAllowedPathnames = new Set<string>([
  appPaths.product.dashboard,
  appPaths.product.companies,
  appPaths.product.calendar,
  appPaths.product.calendarConnect,
  appPaths.product.calendarSettings,
  appPaths.product.settings,
  appPaths.product.profile,
  appPaths.marketing.pricing,
  appPaths.marketing.pricingCheckout,
  appPaths.auth.onboarding,
]);

const legacyPostAuthPathnames = new Map<string, AppPath>([
  ["/settings/profile", appPaths.product.profile],
]);

export function normalizePostAuthReturnPath(
  value: string | null | undefined,
  fallback = appPaths.product.dashboard,
): string {
  const safePath = getSafeRelativeReturnPath(value, fallback);

  try {
    const resolved = new URL(safePath, "https://www.shupass.jp");
    const legacyPath = legacyPostAuthPathnames.get(resolved.pathname);
    if (legacyPath) {
      return `${legacyPath}${resolved.search}${resolved.hash}`;
    }
    if (postAuthAllowedPathnames.has(resolved.pathname)) {
      return `${resolved.pathname}${resolved.search}${resolved.hash}`;
    }
    return fallback;
  } catch {
    return fallback;
  }
}
