import test from "node:test";
import assert from "node:assert/strict";
import { triageMemory } from "./dev-doctor-rules.mjs";

function healthySample(overrides = {}) {
  return {
    swap: { usedGb: 2, totalGb: 12 },
    memoryFreePct: 40,
    nextServer: { maxRssGb: 1, count: 1 },
    supabaseAnalyticsRunning: false,
    nextDevDirGb: 0.5,
    ...overrides,
  };
}

test("swap critical usage creates P0 issue with stable signature", () => {
  const result = triageMemory(healthySample({ swap: { usedGb: 11.85, totalGb: 13 } }));

  assert.equal(result.ok, false);
  assert.equal(result.summary.p0, 1);
  assert(result.issues.some((issue) => issue.source === "swap" && issue.signature === "swap:P0"));
});

test("running Supabase analytics creates P2 guidance without blocking ok", () => {
  const result = triageMemory(healthySample({ supabaseAnalyticsRunning: true }));

  assert.equal(result.ok, true);
  assert.equal(result.summary.p2, 1);
  assert.equal(result.issues[0].severity, "P2");
  assert.match(result.issues[0].suggestedAction, /\[analytics\]/);
});

test("healthy sample is ok with no P0 or P1 issues", () => {
  const result = triageMemory(healthySample());

  assert.equal(result.ok, true);
  assert.equal(result.summary.p0, 0);
  assert.equal(result.summary.p1, 0);
});

test("duplicate next-server process creates P1 issue", () => {
  const result = triageMemory(healthySample({ nextServer: { maxRssGb: 1, count: 2 } }));

  assert.equal(result.ok, false);
  assert.equal(result.summary.p1, 1);
  assert(result.issues.some((issue) => issue.source === "duplicate-next-dev" && issue.severity === "P1"));
});

test("swap thresholds include exact warning and critical boundaries", () => {
  const warn = triageMemory(healthySample({ swap: { usedGb: 8, totalGb: 13 } }));
  const crit = triageMemory(healthySample({ swap: { usedGb: 11, totalGb: 13 } }));

  assert.equal(warn.summary.p1, 1);
  assert(warn.issues.some((issue) => issue.signature === "swap:P1"));
  assert.equal(crit.summary.p0, 1);
  assert(crit.issues.some((issue) => issue.signature === "swap:P0"));
});

test("null signals do not create issues", () => {
  const result = triageMemory({
    swap: null,
    memoryFreePct: null,
    nextServer: null,
    supabaseAnalyticsRunning: null,
    nextDevDirGb: null,
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.issues, []);
  assert.deepEqual(result.summary, { p0: 0, p1: 0, p2: 0, total: 0 });
});

test("issues expose the JSON fields used by the CLI", () => {
  const result = triageMemory(healthySample({ swap: { usedGb: 11.85, totalGb: 13 } }));

  for (const issue of result.issues) {
    assert.equal(typeof issue.severity, "string");
    assert.equal(typeof issue.source, "string");
    assert.equal(typeof issue.description, "string");
    assert.equal(typeof issue.suggestedAction, "string");
    assert.equal(typeof issue.signature, "string");
  }
});
