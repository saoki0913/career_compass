import path from "node:path";
import process from "node:process";

const VALID_VIEWPORTS = new Set(["mobile", "tablet", "desktop"]);
const DEFAULT_OUTPUT_DIR = "public/screenshots/generated";

export function getScreenshotCaptureUsage() {
  return [
    "Usage: npm run screenshots:capture -- [/route-or-route-id ...] [--viewport=mobile,tablet,desktop] [--output-dir=public/screenshots/generated] [--headed]",
  ].join("\n");
}

export function normalizeScreenshotCaptureFilter(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed) {
    throw new Error("Screenshot capture filter cannot be empty");
  }
  if (trimmed.startsWith("/")) {
    const [pathname] = trimmed.split(/[?#]/, 1);
    return pathname === "/" ? "/" : pathname.replace(/\/+$/u, "");
  }
  if (!/^[a-z]+(?:\.[a-zA-Z0-9]+)+$/u.test(trimmed)) {
    throw new Error(`Screenshot capture filter must be a route path or route id: ${value}`);
  }
  return trimmed;
}

export function parseScreenshotCaptureArgs(argv) {
  const filters = [];
  let headed = false;
  let authInteractive = false;
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
    if (arg.startsWith("--viewport=")) {
      viewports = arg
        .slice("--viewport=".length)
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);
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
  const repoRelativeOutputDir = path
    .relative(process.cwd(), path.resolve(process.cwd(), outputDir))
    .replaceAll("\\", "/");
  if (
    !repoRelativeOutputDir.startsWith("../") &&
    repoRelativeOutputDir !== ".." &&
    repoRelativeOutputDir !== DEFAULT_OUTPUT_DIR &&
    !repoRelativeOutputDir.startsWith(`${DEFAULT_OUTPUT_DIR}/`)
  ) {
    throw new Error(
      `Screenshot capture output inside this repo must stay inside ${DEFAULT_OUTPUT_DIR}`,
    );
  }

  return {
    filters: [...new Set(filters)],
    authInteractive,
    headed,
    outputDir,
    viewports: [...new Set(viewports)],
  };
}

export function buildScreenshotCaptureEnv(config) {
  return {
    PLAYWRIGHT_SCREENSHOT_CAPTURE_OUTPUT_DIR: config.outputDir,
    PLAYWRIGHT_SCREENSHOT_CAPTURE_VIEWPORTS: config.viewports.join(","),
    ...(config.authInteractive ? { PLAYWRIGHT_AUTH_CAPTURE_INTERACTIVE: "1" } : {}),
    ...(config.filters.length > 0
      ? { PLAYWRIGHT_SCREENSHOT_CAPTURE_FILTERS: config.filters.join(",") }
      : {}),
    ...(config.headed ? { PLAYWRIGHT_SCREENSHOT_CAPTURE_HEADED: "1" } : {}),
  };
}
