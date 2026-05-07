import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { checkReleaseReadiness } from "./check-plan-release-readiness.mjs";
import { updateGlobalEvidence, updateTrack } from "./update-plan-task-status.mjs";

function createPlan() {
  return {
    schemaVersion: 2,
    lastUpdated: "2026-05-03T00:00:00+09:00",
    statusValues: ["todo", "in_progress", "blocked", "verifying", "done"],
    tracks: [
      {
        id: "release-gate-repair-p0",
        priority: "P0",
        releaseBlocker: true,
        status: "todo",
        requiredGates: [
          { id: "release-critical", command: "npm run test:release-critical", required: true },
        ],
        evidence: [],
        releaseBlockers: [],
        e2eFunctional: { requiredFeatures: [], manifestPaths: [], snapshotHash: null, status: "not_required" },
      },
    ],
  };
}

test("release readiness blocks todo release blocker tracks", () => {
  const result = checkReleaseReadiness(createPlan());
  assert.equal(result.ready, false);
  assert.match(result.blockers[0].reason, /status is todo/);
});

test("updater refuses done without required evidence", () => {
  const plan = createPlan();
  assert.throws(
    () => updateTrack(plan, { trackId: "release-gate-repair-p0", status: "done" }),
    /Missing required gates: release-critical/,
  );
});

test("updater records evidence and allows done", () => {
  const plan = createPlan();
  updateTrack(plan, {
    trackId: "release-gate-repair-p0",
    gateId: "release-critical",
    command: "npm run test:release-critical",
    gateStatus: "passed",
    completedAt: "2026-05-03T01:00:00+09:00",
  });
  updateTrack(plan, { trackId: "release-gate-repair-p0", status: "done" });
  const result = checkReleaseReadiness(plan);
  assert.equal(result.ready, true);
});

test("blocked status requires a blocker reason", () => {
  const plan = createPlan();
  assert.throws(
    () => updateTrack(plan, { trackId: "release-gate-repair-p0", status: "blocked" }),
    /blocked status requires/,
  );
});

test("updater clears release blockers when requested", () => {
  const plan = createPlan();
  const track = plan.tracks[0];
  track.releaseBlockers = ["waiting for evidence"];
  updateTrack(plan, { trackId: "release-gate-repair-p0", clearBlockers: true });
  assert.deepEqual(track.releaseBlockers, []);
});

test("release readiness blocks missing global required gates", () => {
  const plan = createPlan();
  plan.globalRequiredGates = [
    { id: "tracker", command: "bash scripts/test-review-tracker.sh", required: true },
  ];
  updateTrack(plan, {
    trackId: "release-gate-repair-p0",
    gateId: "release-critical",
    command: "npm run test:release-critical",
    gateStatus: "passed",
    completedAt: "2026-05-03T01:00:00+09:00",
  });
  updateTrack(plan, { trackId: "release-gate-repair-p0", status: "done" });
  assert.equal(checkReleaseReadiness(plan).ready, false);
  updateGlobalEvidence(plan, {
    gateId: "tracker",
    command: "bash scripts/test-review-tracker.sh",
    gateStatus: "passed",
    completedAt: "2026-05-03T01:05:00+09:00",
  });
  assert.equal(checkReleaseReadiness(plan).ready, true);
});

test("release readiness requires manifest paths for passed E2E features", () => {
  const plan = createPlan();
  const track = plan.tracks[0];
  track.status = "done";
  track.requiredGates = [];
  track.e2eFunctional = {
    requiredFeatures: ["es-review"],
    manifestPaths: [],
    snapshotHash: "abc123",
    status: "passed",
  };

  const result = checkReleaseReadiness(plan);
  assert.equal(result.ready, false);
  assert.match(result.blockers[0].reason, /manifestPaths is empty/);
});

test("release readiness validates E2E manifest feature, env, snapshot, and browser status", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "plan-e2e-"));
  const manifestPath = path.join(dir, "es-review.json");
  fs.writeFileSync(
    manifestPath,
    JSON.stringify({
      feature: "es-review",
      targetEnv: "local",
      status: "passed",
      snapshotHash: "abc123",
      browserRequired: true,
      playwrightStatus: "passed",
    }),
  );
  const plan = createPlan();
  const track = plan.tracks[0];
  track.status = "done";
  track.requiredGates = [];
  track.e2eFunctional = {
    requiredFeatures: ["es-review"],
    manifestPaths: [manifestPath],
    snapshotHash: "abc123",
    status: "passed",
  };

  assert.equal(checkReleaseReadiness(plan).ready, true);

  fs.writeFileSync(
    manifestPath,
    JSON.stringify({
      feature: "motivation",
      targetEnv: "staging",
      status: "passed",
      snapshotHash: "stale",
      browserRequired: true,
      playwrightStatus: "failed",
    }),
  );

  const result = checkReleaseReadiness(plan);
  assert.equal(result.ready, false);
  assert(result.blockers.some((blocker) => /targetEnv is not local/.test(blocker.reason)));
  assert(result.blockers.some((blocker) => /snapshotHash is stale/.test(blocker.reason)));
  assert(result.blockers.some((blocker) => /Playwright manifest is not passed/.test(blocker.reason)));
  assert(result.blockers.some((blocker) => /missing required feature: es-review/.test(blocker.reason)));
});
