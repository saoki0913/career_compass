#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const UNSAFE_METHOD_RE = /export\s+async\s+function\s+(POST|PUT|PATCH|DELETE)\s*\(/u;
const SESSION_AUTH_RE = /\bauth\.api\.getSession\s*\(/u;
const CSRF_RE = /\bgetCsrfFailureReason\s*\(/u;
const DEFAULT_ROUTE_ROOT = "src/app/api";
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

function shouldRequireCsrf(relPath, source, requiredPrefixes, allowlist) {
  if (allowlist.includes(relPath)) return false;
  if (!requiredPrefixes.some((prefix) => relPath.startsWith(prefix))) return false;
  return UNSAFE_METHOD_RE.test(source) && SESSION_AUTH_RE.test(source);
}

export function evaluateRouteCsrf({ routeRoot, projectRoot, requiredPrefixes, allowlist }) {
  const failures = [];
  for (const filePath of walkRoutes(path.join(projectRoot, routeRoot))) {
    const relPath = normalizePath(path.relative(projectRoot, filePath));
    const source = fs.readFileSync(filePath, "utf8");
    if (shouldRequireCsrf(relPath, source, requiredPrefixes, allowlist) && !CSRF_RE.test(source)) {
      failures.push(relPath);
    }
  }
  return failures;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const projectRoot = path.resolve(argValue("--project", process.cwd()));
  const routeRoot = argValue("--route-root", DEFAULT_ROUTE_ROOT);
  const requiredPrefixesInput = parseCsv(argValue("--required-prefixes"));
  const allowlistInput = parseCsv(argValue("--allowlist"));
  const requiredPrefixes = requiredPrefixesInput.length
    ? requiredPrefixesInput
    : DEFAULT_REQUIRED_PREFIXES;
  const allowlist = allowlistInput.length ? allowlistInput : DEFAULT_ALLOWLIST;

  const failures = evaluateRouteCsrf({ routeRoot, projectRoot, requiredPrefixes, allowlist });
  if (failures.length > 0) {
    process.stderr.write("CSRF guard missing from high-risk authenticated API routes:\n");
    for (const failure of failures) {
      process.stderr.write(`- ${failure}\n`);
    }
    process.exit(1);
  }
  process.stdout.write("CSRF API route check passed.\n");
}
