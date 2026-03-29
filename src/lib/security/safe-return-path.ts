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
