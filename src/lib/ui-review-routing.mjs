import { collectChangedFiles, readGitHubEventPayload } from "./ui-ci-context.mjs";

const PUBLIC_REVIEW_ROUTES = ["/", "/pricing", "/tools", "/templates"];
const PRODUCT_REVIEW_ROUTES = [
  "/dashboard",
  "/companies",
  "/companies/new",
  "/es",
  "/gakuchika",
  "/tasks",
  "/calendar",
  "/notifications",
  "/settings",
  "/profile",
  "/search",
];
const ALL_REVIEW_ROUTES = [...new Set([...PUBLIC_REVIEW_ROUTES, ...PRODUCT_REVIEW_ROUTES])];

const PUBLIC_SHARED_ROUTE_FILES = [
  /^src\/components\/public-surface\//,
  /^src\/components\/seo\//,
  /^src\/lib\/marketing\//,
];

const ALL_SHARED_ROUTE_FILES = [
  /^src\/components\/ui\//,
  /^src\/components\/skeletons\//,
  /^src\/components\/loading\//,
  /^src\/components\/shared\//,
  /^src\/components\/chat\//,
  /^src\/components\/auth\//,
  /^src\/app\/globals\.css$/,
];

const PUBLIC_MARKETING_ROUTES = [
  "/",
  "/pricing",
  "/tools",
  "/templates",
  "/shukatsu-ai",
  "/entry-sheet-ai",
  "/es-tensaku-ai",
  "/shukatsu-kanri",
  "/es-ai-guide",
  "/contact",
  "/terms",
  "/privacy",
  "/legal",
  "/data-source-policy",
];

const PUBLIC_ROUTE_PREFIXES = ["/pricing/", "/tools/", "/templates/"];

function uniqueStrings(values) {
  return [...new Set(values.filter(Boolean))];
}

export function getUiReviewFallbackRoutes(kind = "all") {
  if (kind === "public") {
    return PUBLIC_MARKETING_ROUTES;
  }

  if (kind === "product") {
    return PRODUCT_REVIEW_ROUTES;
  }

  return ALL_REVIEW_ROUTES;
}

export function parseUiReviewRoutesFromBody(body) {
  if (!body?.trim()) {
    return [];
  }

  const lines = body.split(/\r?\n/);
  const startIndex = lines.findIndex((line) => /^#{2,3}\s+UI Review Routes\b/i.test(line.trim()));
  if (startIndex < 0) {
    return [];
  }

  const routes = [];
  for (const line of lines.slice(startIndex + 1)) {
    if (/^#{2,3}\s+/.test(line.trim())) {
      break;
    }

    const match = line.match(/^\s*[-*]?\s*(`?)(\/[^\s`]*?)\1(?:\s|$)/);
    if (match?.[2]) {
      routes.push(match[2]);
    }
  }

  return uniqueStrings(routes.map(normalizeReviewRoute));
}

export function normalizeReviewRoute(route) {
  const trimmed = route.trim();
  if (!trimmed) {
    throw new Error("UI review route cannot be empty");
  }

  if (!trimmed.startsWith("/")) {
    throw new Error(`UI review route must start with '/': ${route}`);
  }

  const [pathname] = trimmed.split(/[?#]/);
  return pathname === "/" ? "/" : pathname.replace(/\/+$/, "");
}

export function classifyUiReviewAuthMode(routes) {
  return routes.some((route) => isProductReviewRoute(route)) ? "guest" : "none";
}

export function resolveUiReviewRoutes({
  changedFiles = [],
  prBody = "",
} = {}) {
  const normalizedChangedFiles = changedFiles.map(normalizeFilePath).filter(Boolean);
  const explicitRoutes = parseUiReviewRoutesFromBody(prBody);
  const fileResolution = deriveRoutesFromFiles(normalizedChangedFiles);
  const derivedRoutes = fileResolution.routes;
  const hasSharedChange = fileResolution.shared;
  const shouldRun = normalizedChangedFiles.length > 0 && derivedRoutes.length > 0;

  if (!shouldRun) {
    return {
      shouldRun: false,
      source: "no-ui-changes",
      routes: [],
      authMode: "none",
      changedFiles: normalizedChangedFiles,
      explicitRoutes,
      derivedRoutes,
      hasSharedChange,
    };
  }

  if (explicitRoutes.length > 0) {
    if (hasSharedChange || derivedRoutes.length === 0) {
      const routes = uniqueStrings(explicitRoutes);
      return {
        shouldRun: true,
        source: "pr-body",
        routes,
        authMode: classifyUiReviewAuthMode(routes),
        changedFiles: normalizedChangedFiles,
        explicitRoutes,
        derivedRoutes,
        hasSharedChange,
      };
    }

    const routes = uniqueStrings([...explicitRoutes, ...derivedRoutes]);
    return {
      shouldRun: true,
      source: "pr-body+files",
      routes,
      authMode: classifyUiReviewAuthMode(routes),
      changedFiles: normalizedChangedFiles,
      explicitRoutes,
      derivedRoutes,
      hasSharedChange,
    };
  }

  if (hasSharedChange) {
    const routes = selectFallbackRoutes(fileResolution.kind);
    return {
      shouldRun: true,
      source: "fallback",
      routes,
      authMode: classifyUiReviewAuthMode(routes),
      changedFiles: normalizedChangedFiles,
      explicitRoutes,
      derivedRoutes,
      hasSharedChange,
    };
  }

  const routes = uniqueStrings(derivedRoutes);
  return {
    shouldRun: true,
    source: "derived",
    routes,
    authMode: classifyUiReviewAuthMode(routes),
    changedFiles: normalizedChangedFiles,
    explicitRoutes,
    derivedRoutes,
    hasSharedChange,
  };
}

export function resolveUiReviewScopeFromContext(env = process.env) {
  const event = readGitHubEventPayload(env);
  const prBody = event?.pull_request?.body ?? "";
  const changedFiles = collectChangedFiles({ env });
  return resolveUiReviewRoutes({
    changedFiles,
    prBody,
  });
}

export function deriveRoutesFromFiles(changedFiles) {
  const routeSet = new Set();
  let kind = null;
  let shared = false;

  for (const filePath of changedFiles) {
    const resolution = resolveRoutesForFile(filePath);
    if (!resolution) {
      continue;
    }

    kind = mergeKinds(kind, resolution.kind);
    shared = shared || resolution.shared;
    for (const route of resolution.routes) {
      routeSet.add(route);
    }
  }

  return {
    routes: [...routeSet],
    shared,
    kind,
  };
}

function resolveRoutesForFile(filePath) {
  const normalized = normalizeFilePath(filePath);
  if (!isUiRelevantFile(normalized)) {
    return null;
  }

  if (/^src\/app\/\(marketing\)\/page\.tsx$/.test(normalized)) {
    return { routes: ["/"], kind: "public", shared: false };
  }

  if (/^src\/components\/landing\//.test(normalized)) {
    return { routes: ["/"], kind: "public", shared: false };
  }

  if (/^src\/app\/\(marketing\)\/pricing\//.test(normalized) || /^src\/lib\/marketing\/pricing/.test(normalized)) {
    return { routes: ["/pricing"], kind: "public", shared: false };
  }

  if (PUBLIC_SHARED_ROUTE_FILES.some((pattern) => pattern.test(normalized))) {
    return { routes: getUiReviewFallbackRoutes("public"), kind: "public", shared: true };
  }

  if (ALL_SHARED_ROUTE_FILES.some((pattern) => pattern.test(normalized))) {
    return { routes: getUiReviewFallbackRoutes("all"), kind: "all", shared: true };
  }

  if (/^src\/app\//.test(normalized)) {
    const derived = deriveAppRouteFromPath(normalized, "src/app");
    if (derived) {
      return { routes: [derived], kind: isPublicRoute(derived) ? "public" : "product", shared: false };
    }
  }

  if (/^src\/components\//.test(normalized)) {
    return { routes: getUiReviewFallbackRoutes("all"), kind: "all", shared: true };
  }

  return null;
}

function deriveAppRouteFromPath(filePath, appRootPrefix) {
  const remainder = filePath.replace(`${appRootPrefix}/`, "");
  const segments = remainder.split("/");
  const routeSegments = [];

  for (const segment of segments) {
    if (segment === "page.tsx" || segment === "layout.tsx" || segment === "loading.tsx") {
      break;
    }

    if (segment.startsWith("(") && segment.endsWith(")")) {
      continue;
    }

    if (segment.startsWith("[")) {
      break;
    }

    routeSegments.push(segment);
  }

  if (routeSegments.length === 0) {
    return "/";
  }

  return normalizeReviewRoute(`/${routeSegments.join("/")}`);
}

function isUiRelevantFile(filePath) {
  return (
    /^src\/app\/\((?:marketing|product|auth)\)\//.test(filePath) ||
    /^src\/app\/(?:page|layout|loading)\.(?:t|j)sx?$/.test(filePath) ||
    /^src\/app\/globals\.css$/.test(filePath) ||
    /^src\/components\//.test(filePath) ||
    /^src\/lib\/marketing\//.test(filePath)
  );
}

function isPublicRoute(route) {
  return (
    PUBLIC_REVIEW_ROUTES.includes(route) ||
    PUBLIC_MARKETING_ROUTES.includes(route) ||
    PUBLIC_ROUTE_PREFIXES.some((prefix) => route.startsWith(prefix))
  );
}

function isProductReviewRoute(route) {
  return PRODUCT_REVIEW_ROUTES.some((candidate) => route === candidate || route.startsWith(`${candidate}/`));
}

function normalizeFilePath(filePath) {
  return filePath.replaceAll("\\", "/").trim();
}

function selectFallbackRoutes(kind) {
  if (kind === "public") {
    return getUiReviewFallbackRoutes("public");
  }

  if (kind === "product") {
    return getUiReviewFallbackRoutes("product");
  }

  return getUiReviewFallbackRoutes("all");
}

function mergeKinds(currentKind, nextKind) {
  if (!currentKind) {
    return nextKind;
  }

  if (currentKind === nextKind) {
    return currentKind;
  }

  if (currentKind === "all" || nextKind === "all") {
    return "all";
  }

  return "all";
}
