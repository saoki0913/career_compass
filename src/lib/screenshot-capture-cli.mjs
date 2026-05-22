import path from "node:path";
import process from "node:process";

const VALID_VIEWPORTS = new Set(["mobile", "tablet", "desktop"]);
const VALID_GROUPS = new Set(["marketing", "checklists", "auth", "product"]);
const DEFAULT_BASE_URL = "http://localhost:3000";
const DEFAULT_OUTPUT_DIR = "public/screenshots/generated";

export function getScreenshotCaptureUsage() {
  return [
    "Usage: npm run screenshots:capture -- [/route-or-route-id ...] [--group=marketing] [--base-url=http://localhost:3000] [--viewport=mobile,tablet,desktop] [--output-dir=public/screenshots/generated] [--headed] [--no-atomic]",
  ].join("\n");
}

export function normalizeScreenshotCaptureFilter(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed) {
    throw new Error("Screenshot capture filter cannot be empty");
  }
  if (trimmed.startsWith("//")) {
    throw new Error(`Screenshot capture filter must be a route path or route id: ${value}`);
  }
  if (trimmed.startsWith("/")) {
    const url = new URL(trimmed, DEFAULT_BASE_URL);
    const pathname = url.pathname === "/" ? "/" : url.pathname.replace(/\/+$/u, "");
    return `${pathname}${url.search}`;
  }
  if (!/^[a-z]+(?:\.[a-zA-Z0-9]+)+$/u.test(trimmed)) {
    throw new Error(`Screenshot capture filter must be a route path or route id: ${value}`);
  }
  return trimmed;
}

export function parseScreenshotCaptureArgs(argv) {
  const filters = [];
  let groups = [];
  let headed = false;
  let authInteractive = false;
  let atomic = true;
  let baseUrl = DEFAULT_BASE_URL;
  let outputDir = DEFAULT_OUTPUT_DIR;
  let viewports = ["mobile", "tablet", "desktop"];

  for (const arg of argv) {
    if (arg === "--headed") {
      headed = true;
      continue;
    }
    if (arg === "--auth-interactive") {
      authInteractive = true;
      continue;
    }
    if (arg === "--atomic") {
      atomic = true;
      continue;
    }
    if (arg === "--no-atomic") {
      atomic = false;
      continue;
    }
    if (arg.startsWith("--viewport=")) {
      viewports = arg
        .slice("--viewport=".length)
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);
      continue;
    }
    if (arg.startsWith("--group=")) {
      groups = arg
        .slice("--group=".length)
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);
      continue;
    }
    if (arg.startsWith("--base-url=")) {
      baseUrl = arg.slice("--base-url=".length).trim();
      if (!baseUrl) {
        throw new Error("Screenshot capture base URL cannot be empty");
      }
      continue;
    }
    if (arg.startsWith("--output-dir=")) {
      outputDir = arg.slice("--output-dir=".length).trim();
      if (!outputDir) {
        throw new Error("Screenshot capture output directory cannot be empty");
      }
      continue;
    }
    if (arg.startsWith("--")) {
      throw new Error(`Unknown option: ${arg}\n${getScreenshotCaptureUsage()}`);
    }
    filters.push(normalizeScreenshotCaptureFilter(arg));
  }

  const invalidViewport = viewports.find((viewport) => !VALID_VIEWPORTS.has(viewport));
  if (invalidViewport) {
    throw new Error("Screenshot capture viewport must be one of: mobile, tablet, desktop");
  }
  const invalidGroup = groups.find((group) => !VALID_GROUPS.has(group));
  if (invalidGroup) {
    throw new Error("Screenshot capture group must be one of: marketing, checklists, auth, product");
  }
  try {
    const parsedBaseUrl = new URL(baseUrl);
    const isLocalHost = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(parsedBaseUrl.hostname);
    if (parsedBaseUrl.protocol !== "http:" || !isLocalHost) {
      throw new Error("not local");
    }
    baseUrl = parsedBaseUrl.toString().replace(/\/$/u, "");
  } catch {
    throw new Error("Screenshot capture base URL must be a local http URL");
  }
  const repoRelativeOutputDir = path
    .relative(process.cwd(), path.resolve(process.cwd(), outputDir))
    .replaceAll("\\", "/");
  const isOutsideRepo = repoRelativeOutputDir.startsWith("../") || repoRelativeOutputDir === "..";
  const isInsideGeneratedRoot =
    !isOutsideRepo &&
    (repoRelativeOutputDir === DEFAULT_OUTPUT_DIR ||
      repoRelativeOutputDir.startsWith(`${DEFAULT_OUTPUT_DIR}/`));
  if (
    !isOutsideRepo &&
    !isInsideGeneratedRoot
  ) {
    throw new Error(
      `Screenshot capture output inside this repo must stay inside ${DEFAULT_OUTPUT_DIR}`,
    );
  }
  if (atomic && !isInsideGeneratedRoot) {
    throw new Error(
      `Atomic screenshot capture output must stay inside ${DEFAULT_OUTPUT_DIR}`,
    );
  }

  return {
    atomic,
    baseUrl,
    filters: [...new Set(filters)],
    groups: [...new Set(groups)],
    authInteractive,
    headed,
    outputDir,
    viewports: [...new Set(viewports)],
  };
}

export function buildScreenshotCaptureEnv(config) {
  return {
    PLAYWRIGHT_BASE_URL: config.baseUrl,
    PLAYWRIGHT_SCREENSHOT_CAPTURE_OUTPUT_DIR: config.outputDir,
    PLAYWRIGHT_SCREENSHOT_CAPTURE_VIEWPORTS: config.viewports.join(","),
    ...(config.authInteractive ? { PLAYWRIGHT_AUTH_CAPTURE_INTERACTIVE: "1" } : {}),
    ...(config.filters.length > 0
      ? { PLAYWRIGHT_SCREENSHOT_CAPTURE_FILTERS: config.filters.join(",") }
      : {}),
    ...(config.groups.length > 0
      ? { PLAYWRIGHT_SCREENSHOT_CAPTURE_GROUPS: config.groups.join(",") }
      : {}),
    ...(config.headed ? { PLAYWRIGHT_SCREENSHOT_CAPTURE_HEADED: "1" } : {}),
  };
}
