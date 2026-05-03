import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { evaluateRouteCsrf, evaluateRouteCsrfReport } from "./check-api-route-csrf.mjs";

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
  routeRoots: ["src/app/api", "src/bff"],
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

test("flags allowlist routes without an independent signature or secret guard", () =>
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
    assert.deepEqual(failures, ["src/app/api/webhooks/stripe/route.ts"]);
  }));

test("allows signature-verified webhook allowlist routes", () =>
  withProject((projectRoot) => {
    writeRoute(
      projectRoot,
      "src/app/api/webhooks/stripe/route.ts",
      `import { stripe } from "@/lib/stripe";
       export async function POST(req) {
         const signature = req.headers.get("stripe-signature");
         const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
         stripe.webhooks.constructEvent(await req.text(), signature, webhookSecret);
       }`,
    );

    const failures = evaluateRouteCsrf({ projectRoot, ...options });
    assert.deepEqual(failures, []);
  }));

test("inventories unsafe routes under app api and bff roots", () =>
  withProject((projectRoot) => {
    writeRoute(
      projectRoot,
      "src/app/api/public/route.ts",
      `export async function POST() {
         return Response.json({});
       }`,
    );
    writeRoute(
      projectRoot,
      "src/bff/gakuchika/route.ts",
      `import { getRequestIdentity } from "@/bff/identity/request-identity";
       export async function PATCH(req) {
         await getRequestIdentity(req);
       }`,
    );

    const report = evaluateRouteCsrfReport({ projectRoot, ...options });
    assert.deepEqual(
      report.unsafeRoutes.map((route) => [route.path, route.methods, route.protected]),
      [
        ["src/app/api/public/route.ts", ["POST"], false],
        ["src/bff/gakuchika/route.ts", ["PATCH"], true],
      ],
    );
    assert.deepEqual(report.failures, []);
  }));

test("treats getRequestIdentity as protected when a required prefix is gated", () =>
  withProject((projectRoot) => {
    writeRoute(
      projectRoot,
      "src/bff/gakuchika/route.ts",
      `import { getRequestIdentity } from "@/bff/identity/request-identity";
       export async function DELETE(req) {
         await getRequestIdentity(req);
       }`,
    );

    const failures = evaluateRouteCsrf({
      projectRoot,
      routeRoots: ["src/bff"],
      requiredPrefixes: ["src/bff/"],
      allowlist: [],
    });
    assert.deepEqual(failures, ["src/bff/gakuchika/route.ts"]);
  }));

test("allows allowlist routes with a bearer secret guard", () =>
  withProject((projectRoot) => {
    writeRoute(
      projectRoot,
      "src/app/api/internal/job/route.ts",
      `import { timingSafeEqual } from "crypto";
       export async function POST(req) {
         const provided = req.headers.get("authorization");
         const expected = "Bearer " + process.env.CRON_SECRET;
         if (!timingSafeEqual(Buffer.from(provided), Buffer.from(expected))) {
           return new Response(null, { status: 401 });
         }
       }`,
    );

    const failures = evaluateRouteCsrf({
      projectRoot,
      routeRoots: ["src/app/api"],
      requiredPrefixes: ["src/app/api/internal/"],
      allowlist: ["src/app/api/internal/job/route.ts"],
    });
    assert.deepEqual(failures, []);
  }));
