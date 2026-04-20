import test from "node:test";
import assert from "node:assert/strict";
import { evaluateLocalAiE2EReadiness } from "./enforce-local-ai-e2e.mjs";

test("passes when no AI functional files are staged", () => {
  const result = evaluateLocalAiE2EReadiness({
    changedFiles: ["README.md"],
    snapshotHash: "abc",
    readManifestImpl: () => {
      throw new Error("should not read manifest for non-AI changes");
    },
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.features, []);
  assert.deepEqual(result.failures, []);
});

test("requires a fresh passed local manifest for affected features", () => {
  const result = evaluateLocalAiE2EReadiness({
    changedFiles: ["backend/app/routers/motivation.py"],
    snapshotHash: "fresh-hash",
    readManifestImpl: (_repoRoot, feature) => {
      assert.equal(feature, "motivation");
      return {
        targetEnv: "local",
        snapshotHash: "stale-hash",
        status: "passed",
        playwrightStatus: "not_run",
      };
    },
  });

  assert.equal(result.ok, false);
  assert.deepEqual(result.features, ["motivation"]);
  assert.deepEqual(result.failures, [
    {
      feature: "motivation",
      reason: "stale_snapshot",
      manifestSnapshotHash: "stale-hash",
    },
  ]);
});

test("requires ES review browser E2E to pass for commit gating", () => {
  const result = evaluateLocalAiE2EReadiness({
    changedFiles: ["backend/app/routers/es_review.py"],
    snapshotHash: "fresh-hash",
    readManifestImpl: () => ({
      targetEnv: "local",
      snapshotHash: "fresh-hash",
      status: "passed",
      playwrightStatus: "skipped",
    }),
  });

  assert.equal(result.ok, false);
  assert.deepEqual(result.failures, [
    {
      feature: "es-review",
      reason: "playwright_required",
      playwrightStatus: "skipped",
    },
  ]);
});

test("detects CRUD feature scope for calendar changes", () => {
  const result = evaluateLocalAiE2EReadiness({
    changedFiles: ["src/app/api/calendar/settings/route.ts"],
    snapshotHash: "fresh-hash",
    readManifestImpl: () => ({
      targetEnv: "local",
      snapshotHash: "fresh-hash",
      status: "passed",
      playwrightStatus: "not_run",
    }),
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.features, ["calendar"]);
  assert.deepEqual(result.failures, []);
});

test("detects CRUD feature scope for notifications changes", () => {
  const result = evaluateLocalAiE2EReadiness({
    changedFiles: ["src/app/api/notifications/route.ts"],
    snapshotHash: "fresh-hash",
    readManifestImpl: () => ({
      targetEnv: "local",
      snapshotHash: "fresh-hash",
      status: "passed",
      playwrightStatus: "not_run",
    }),
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.features, ["notifications"]);
  assert.deepEqual(result.failures, []);
});

test("detects CRUD shared trigger for staging_client changes", () => {
  const result = evaluateLocalAiE2EReadiness({
    changedFiles: ["backend/tests/conversation/staging_client.py"],
    snapshotHash: "fresh-hash",
    readManifestImpl: () => ({
      targetEnv: "local",
      snapshotHash: "fresh-hash",
      status: "passed",
      playwrightStatus: "not_run",
    }),
  });

  assert.equal(result.ok, true);
  assert.ok(result.features.includes("calendar"));
  assert.ok(result.features.includes("billing"));
  assert.ok(result.features.includes("search-query"));
});

test("requires conversation feature browser E2E to pass for commit gating", () => {
  const result = evaluateLocalAiE2EReadiness({
    changedFiles: ["backend/app/routers/motivation.py"],
    snapshotHash: "fresh-hash",
    readManifestImpl: () => ({
      targetEnv: "local",
      snapshotHash: "fresh-hash",
      status: "passed",
      playwrightStatus: "skipped",
    }),
  });

  assert.equal(result.ok, false);
  assert.deepEqual(result.failures, [
    {
      feature: "motivation",
      reason: "playwright_required",
      playwrightStatus: "skipped",
    },
  ]);
});

test("accepts conversation feature when playwright passes", () => {
  const result = evaluateLocalAiE2EReadiness({
    changedFiles: ["backend/app/routers/motivation.py"],
    snapshotHash: "fresh-hash",
    readManifestImpl: () => ({
      targetEnv: "local",
      snapshotHash: "fresh-hash",
      status: "passed",
      playwrightStatus: "passed",
    }),
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.features, ["motivation"]);
  assert.deepEqual(result.failures, []);
});

test("detects settings path changes as notifications feature", () => {
  const result = evaluateLocalAiE2EReadiness({
    changedFiles: ["src/app/api/settings/route.ts"],
    snapshotHash: "fresh-hash",
    readManifestImpl: () => ({
      targetEnv: "local",
      snapshotHash: "fresh-hash",
      status: "passed",
      playwrightStatus: "not_run",
    }),
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.features, ["notifications"]);
  assert.deepEqual(result.failures, []);
});

test("accepts valid manifests for multiple affected features", () => {
  const result = evaluateLocalAiE2EReadiness({
    changedFiles: [
      "backend/app/routers/company_info_search.py",
      "src/app/(product)/gakuchika/[id]/page.tsx",
    ],
    snapshotHash: "fresh-hash",
    readManifestImpl: (_repoRoot, feature) => ({
      targetEnv: "local",
      snapshotHash: "fresh-hash",
      status: "passed",
      playwrightStatus: ["es-review", "gakuchika", "motivation", "interview", "pages-smoke"].includes(feature) ? "passed" : "not_run",
    }),
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.features, ["gakuchika", "company-info-search"]);
  assert.deepEqual(result.failures, []);
});
