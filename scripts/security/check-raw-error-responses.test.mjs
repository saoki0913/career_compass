import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { evaluateRawErrorResponses } from "./check-raw-error-responses.mjs";

const scriptPath = fileURLToPath(new URL("./check-raw-error-responses.mjs", import.meta.url));

function writeSource(projectRoot, relPath, source) {
  const fullPath = path.join(projectRoot, relPath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, source, "utf8");
}

function withProject(fn) {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "raw-error-response-check-"));
  try {
    return fn(projectRoot);
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  }
}

test("flags raw NextResponse.json error payloads outside the allowlist", () =>
  withProject((projectRoot) => {
    writeSource(
      projectRoot,
      "src/app/api/example/route.ts",
      `import { NextResponse } from "next/server";
       export async function GET() {
         return NextResponse.json({ error: "Internal server error" }, { status: 500 });
       }`,
    );

    const result = evaluateRawErrorResponses({
      projectRoot,
      scanRoots: ["src/app/api"],
      allowlist: {},
    });

    assert.equal(result.violations.length, 1);
    assert.equal(result.violations[0].path, "src/app/api/example/route.ts");
    assert.equal(result.violations[0].detector, "nextResponseJsonError");
  }));

test("allows explicitly counted raw error response debt", () =>
  withProject((projectRoot) => {
    writeSource(
      projectRoot,
      "src/bff/example/route.ts",
      `export async function GET() {
         return NextResponse.json({ error: "Authentication required" }, { status: 401 });
       }`,
    );

    const result = evaluateRawErrorResponses({
      projectRoot,
      scanRoots: ["src/bff"],
      allowlist: {
        "src/bff/example/route.ts": { nextResponseJsonError: 1 },
      },
    });

    assert.equal(result.violations.length, 0);
    assert.equal(result.occurrences.length, 1);
  }));

test("flags additional occurrences in an allowlisted file", () =>
  withProject((projectRoot) => {
    writeSource(
      projectRoot,
      "src/app/api/example/route.ts",
      `export async function GET() {
         if (Math.random() > 0.5) {
           return NextResponse.json({ error: "Authentication required" }, { status: 401 });
         }
         return NextResponse.json({ error: "Internal server error" }, { status: 500 });
       }`,
    );

    const result = evaluateRawErrorResponses({
      projectRoot,
      scanRoots: ["src/app/api"],
      allowlist: {
        "src/app/api/example/route.ts": { nextResponseJsonError: 1 },
      },
    });

    assert.equal(result.violations.length, 1);
    assert.equal(result.violations[0].foundCount, 2);
    assert.equal(result.violations[0].allowedCount, 1);
  }));

test("flags raw JSON.stringify error responses", () =>
  withProject((projectRoot) => {
    writeSource(
      projectRoot,
      "src/bff/example/stream.ts",
      `export function errorResponse(msg) {
         return new Response(JSON.stringify({ error: msg }), { status: 500 });
       }`,
    );

    const result = evaluateRawErrorResponses({
      projectRoot,
      scanRoots: ["src/bff"],
      allowlist: {},
    });

    assert.equal(result.violations.length, 1);
    assert.equal(result.violations[0].detector, "responseJsonStringifyError");
  }));

test("CLI reports unallowlisted browser-facing raw errors", () =>
  withProject((projectRoot) => {
    writeSource(
      projectRoot,
      "src/app/api/example/route.ts",
      `export async function GET() {
         return NextResponse.json({ error: "Internal server error" }, { status: 500 });
       }`,
    );

    const result = spawnSync(
      process.execPath,
      [scriptPath, "--project", projectRoot, "--scan-roots", "src/app/api"],
      { encoding: "utf8" },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /Browser-facing raw error responses outside the explicit allowlist/u);
    assert.match(result.stderr, /src\/app\/api\/example\/route\.ts/u);
  }));
