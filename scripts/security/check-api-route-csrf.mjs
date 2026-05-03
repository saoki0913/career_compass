#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const UNSAFE_METHOD_RE = /export\s+async\s+function\s+(POST|PUT|PATCH|DELETE)\s*\(/gu;
const SESSION_AUTH_RE = /\bauth\.api\.getSession\s*\(/u;
const REQUEST_IDENTITY_AUTH_RE = /\bgetRequestIdentity\s*\(/u;
const CSRF_RE = /\bgetCsrfFailureReason\s*\(/u;
const STRIPE_CONSTRUCT_EVENT_RE = /\bstripe\.webhooks\.constructEvent\s*\(/u;
const STRIPE_SIGNATURE_HEADER_RE = /\bstripe-signature\b/u;
const STRIPE_WEBHOOK_SECRET_RE = /\bSTRIPE_WEBHOOK_SECRET\b/u;
const SECRET_GUARD_RE =
  /\b(timingSafeEqual|hasMatchingSecret|parseBearerSecret|verifyToken)\b[\s\S]*\b(authorization|Bearer|CRON_SECRET|AUTH_SECRET|INTERNAL_API_SECRET)\b/u;
const DEFAULT_ROUTE_ROOTS = ["src/app/api", "src/bff"];
const DEFAULT_REQUIRED_PREFIXES = [
  "src/app/api/auth/",
  "src/app/api/stripe/",
];
const DEFAULT_ALLOWLIST = [
  "src/app/api/webhooks/stripe/route.ts",
];

function argValue(name, fallback = "") {
  const index = process.argv.indexOf(name);
  if (index === -1 || index + 1 >= process.argv.length) return fallback;
  return process.argv[index + 1];
}

function parseCsv(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizePath(value) {
  return value.split(path.sep).join("/");
}

function walkRoutes(dir, routes = []) {
  if (!fs.existsSync(dir)) return routes;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkRoutes(fullPath, routes);
    } else if (entry.isFile() && entry.name === "route.ts") {
      routes.push(fullPath);
    }
  }
  return routes;
}

function getUnsafeMethods(source) {
  const methods = new Set();
  for (const match of source.matchAll(UNSAFE_METHOD_RE)) {
    methods.add(match[1]);
  }
  return [...methods].sort();
}

function hasProtectedIdentity(source) {
  return SESSION_AUTH_RE.test(source) || REQUEST_IDENTITY_AUTH_RE.test(source);
}

function hasIndependentAllowlistGuard(source) {
  const hasStripeSignatureGuard =
    STRIPE_CONSTRUCT_EVENT_RE.test(source) &&
    STRIPE_SIGNATURE_HEADER_RE.test(source) &&
    STRIPE_WEBHOOK_SECRET_RE.test(source);
  return hasStripeSignatureGuard || SECRET_GUARD_RE.test(source);
}

function routeRequiresCsrf(relPath, source, requiredPrefixes) {
  if (!requiredPrefixes.some((prefix) => relPath.startsWith(prefix))) return false;
  return getUnsafeMethods(source).length > 0 && hasProtectedIdentity(source);
}

function resolveRouteRoots(routeRoot, routeRoots) {
  if (routeRoots?.length) return routeRoots;
  if (routeRoot) return [routeRoot];
  return DEFAULT_ROUTE_ROOTS;
}

export function evaluateRouteCsrfReport({
  routeRoot = "",
  routeRoots = [],
  projectRoot,
  requiredPrefixes,
  allowlist,
}) {
  const failures = [];
  const unsafeRoutes = [];
  const allowlistSet = new Set(allowlist);
  const visited = new Set();

  for (const root of resolveRouteRoots(routeRoot, routeRoots)) {
    for (const filePath of walkRoutes(path.join(projectRoot, root))) {
      const relPath = normalizePath(path.relative(projectRoot, filePath));
      if (visited.has(relPath)) continue;
      visited.add(relPath);

      const source = fs.readFileSync(filePath, "utf8");
      const unsafeMethods = getUnsafeMethods(source);
      if (unsafeMethods.length === 0) continue;

      const protectedIdentity = hasProtectedIdentity(source);
      const hasCsrfGuard = CSRF_RE.test(source);
      const allowlisted = allowlistSet.has(relPath);
      const hasAllowlistGuard = hasIndependentAllowlistGuard(source);
      unsafeRoutes.push({
        path: relPath,
        methods: unsafeMethods,
        protected: protectedIdentity,
        csrf: hasCsrfGuard,
        allowlisted,
        allowlistGuard: hasAllowlistGuard,
      });

      if (allowlisted && !hasAllowlistGuard) {
        failures.push({
          path: relPath,
          reason: "allowlist_without_independent_signature_or_secret_guard",
        });
        continue;
      }

      if (routeRequiresCsrf(relPath, source, requiredPrefixes) && !hasCsrfGuard && !allowlisted) {
        failures.push({
          path: relPath,
          reason: "protected_unsafe_route_without_csrf",
        });
      }
    }
  }

  return { failures, unsafeRoutes };
}

export function evaluateRouteCsrf({ routeRoot, routeRoots, projectRoot, requiredPrefixes, allowlist }) {
  return evaluateRouteCsrfReport({
    routeRoot,
    routeRoots,
    projectRoot,
    requiredPrefixes,
    allowlist,
  }).failures.map((failure) => failure.path);
}

function writeReport(report) {
  const protectedCount = report.unsafeRoutes.filter((route) => route.protected).length;
  const csrfCount = report.unsafeRoutes.filter((route) => route.csrf).length;
  const allowlistedCount = report.unsafeRoutes.filter((route) => route.allowlisted).length;

  process.stdout.write(
    `CSRF inventory: ${report.unsafeRoutes.length} unsafe route(s), ${protectedCount} protected, ${csrfCount} with CSRF, ${allowlistedCount} allowlisted.\n`,
  );
}

function writeFailures(failures) {
  process.stderr.write("CSRF guard missing from protected unsafe API routes:\n");
  for (const failure of failures) {
    process.stderr.write(`- ${failure.path} (${failure.reason})\n`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const projectRoot = path.resolve(argValue("--project", process.cwd()));
  const legacyRouteRoot = argValue("--route-root");
  const routeRootsInput = parseCsv(argValue("--route-roots"));
  const requiredPrefixesInput = parseCsv(argValue("--required-prefixes"));
  const allowlistInput = parseCsv(argValue("--allowlist"));
  const requiredPrefixes = requiredPrefixesInput.length
    ? requiredPrefixesInput
    : DEFAULT_REQUIRED_PREFIXES;
  const allowlist = allowlistInput.length ? allowlistInput : DEFAULT_ALLOWLIST;

  const report = evaluateRouteCsrfReport({
    routeRoot: legacyRouteRoot,
    routeRoots: routeRootsInput,
    projectRoot,
    requiredPrefixes,
    allowlist,
  });

  writeReport(report);
  if (report.failures.length > 0) {
    writeFailures(report.failures);
    process.exit(1);
  }
  process.stdout.write("CSRF API route check passed.\n");
}
