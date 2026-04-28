import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { evaluateRouteCsrf } from "./check-api-route-csrf.mjs";

function writeRoute(projectRoot, relPath, source) {
  const fullPath = path.join(projectRoot, relPath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, source, "utf8");
}

function withProject(fn) {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "csrf-route-check-"));
  try {
    return fn(projectRoot);
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  }
}

const options = {
  routeRoot: "src/app/api",
  requiredPrefixes: ["src/app/api/auth/", "src/app/api/stripe/"],
  allowlist: ["src/app/api/webhooks/stripe/route.ts"],
};

test("flags high-risk authenticated unsafe routes without CSRF guard", () =>
  withProject((projectRoot) => {
    writeRoute(
      projectRoot,
      "src/app/api/stripe/checkout/route.ts",
      `import { auth } from "@/lib/auth";
       export async function POST(req) {
         await auth.api.getSession({ headers: req.headers });
       }`,
    );

    const failures = evaluateRouteCsrf({ projectRoot, ...options });
    assert.deepEqual(failures, ["src/app/api/stripe/checkout/route.ts"]);
  }));

test("allows high-risk authenticated unsafe routes with CSRF guard", () =>
  withProject((projectRoot) => {
    writeRoute(
      projectRoot,
      "src/app/api/stripe/portal/route.ts",
      `import { auth } from "@/lib/auth";
       import { getCsrfFailureReason } from "@/lib/csrf";
       export async function POST(req) {
         if (getCsrfFailureReason(req)) return new Response(null, { status: 403 });
         await auth.api.getSession({ headers: req.headers });
       }`,
    );

    const failures = evaluateRouteCsrf({ projectRoot, ...options });
    assert.deepEqual(failures, []);
  }));

test("allows signature-verified webhook allowlist routes", () =>
  withProject((projectRoot) => {
    writeRoute(
      projectRoot,
      "src/app/api/webhooks/stripe/route.ts",
      `import { auth } from "@/lib/auth";
       export async function POST(req) {
         await auth.api.getSession({ headers: req.headers });
       }`,
    );

    const failures = evaluateRouteCsrf({ projectRoot, ...options });
    assert.deepEqual(failures, []);
  }));
