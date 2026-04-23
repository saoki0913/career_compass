const VALID_AUTH_MODES = new Set(["none", "guest", "mock", "real"]);

export function getUiReviewUsage() {
  return "Usage: npm run test:ui:review -- /route [/another-route] [--auth=none|guest|mock|real] [--headed]";
}

export function parseUiReviewArgs(argv) {
  const paths = [];
  let authMode = "none";
  let headed = false;

  for (const arg of argv) {
    if (arg.startsWith("--auth=")) {
      authMode = arg.slice("--auth=".length).trim();
      continue;
    }

    if (arg === "--headed") {
      headed = true;
      continue;
    }

    if (arg.startsWith("--")) {
      throw new Error(`Unknown option: ${arg}\n${getUiReviewUsage()}`);
    }

    paths.push(normalizeUiReviewPath(arg));
  }

  if (!VALID_AUTH_MODES.has(authMode)) {
    throw new Error(`UI review auth must be one of: none, guest, mock, real`);
  }

  if (paths.length === 0) {
    throw new Error(getUiReviewUsage());
  }

  return { authMode, paths, headed };
}

export function buildUiReviewEnv({ authMode, paths, headed = false }) {
  return {
    PLAYWRIGHT_UI_AUTH_MODE: authMode,
    PLAYWRIGHT_UI_PATHS: paths.map(normalizeUiReviewPath).join(","),
    ...(headed ? { PLAYWRIGHT_UI_HEADED: "1" } : {}),
  };
}

export function parseUiReviewPaths(rawPaths) {
  if (!rawPaths?.trim()) {
    throw new Error("PLAYWRIGHT_UI_PATHS is required for e2e/ui-review.spec.ts");
  }

  return rawPaths
    .split(",")
    .map((value) => normalizeUiReviewPath(value))
    .filter(Boolean);
}

export function slugifyUiReviewPath(routePath) {
  const normalized = normalizeUiReviewPath(routePath);
  if (normalized === "/") {
    return "home";
  }

  return normalized
    .replace(/^\//, "")
    .replace(/\[([^\]]+)\]/g, "$1")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

function normalizeUiReviewPath(routePath) {
  const trimmed = routePath.trim();
  if (!trimmed) {
    throw new Error("UI review route cannot be empty");
  }

  if (!trimmed.startsWith("/")) {
    throw new Error(`UI review route must start with '/': ${routePath}`);
  }

  const [pathname] = trimmed.split(/[?#]/, 1);
  if (!pathname) {
    return "/";
  }

  if (pathname === "/") {
    return "/";
  }

  return pathname.replace(/\/+$/, "");
}
