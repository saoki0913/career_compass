import fs from "node:fs";
import path from "node:path";

export const DEFAULT_PLAN_PATH = path.join(process.cwd(), "docs/plan/PLAN_EXECUTION_TASKS.json");
export const STATUS_VALUES = new Set(["todo", "in_progress", "blocked", "verifying", "done"]);
export const EVIDENCE_STATUS_VALUES = new Set(["passed", "failed", "skipped"]);

export function readPlan(planPath = DEFAULT_PLAN_PATH) {
  return JSON.parse(fs.readFileSync(planPath, "utf8"));
}

export function writePlan(plan, planPath = DEFAULT_PLAN_PATH) {
  fs.writeFileSync(planPath, `${JSON.stringify(plan, null, 2)}\n`, "utf8");
}

export function formatJstTimestamp(date = new Date()) {
  const jst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  const pad = (value) => String(value).padStart(2, "0");
  return [
    jst.getUTCFullYear(),
    "-",
    pad(jst.getUTCMonth() + 1),
    "-",
    pad(jst.getUTCDate()),
    "T",
    pad(jst.getUTCHours()),
    ":",
    pad(jst.getUTCMinutes()),
    ":",
    pad(jst.getUTCSeconds()),
    "+09:00",
  ].join("");
}

export function findTrack(plan, trackId) {
  const track = plan.tracks?.find((candidate) => candidate.id === trackId);
  if (!track) {
    throw new Error(`Unknown track: ${trackId}`);
  }
  return track;
}

export function passedGateIds(track) {
  return new Set(
    (track.evidence || [])
      .filter((item) => item && item.status === "passed" && item.gateId)
      .map((item) => item.gateId),
  );
}

export function missingRequiredGates(track) {
  const passed = passedGateIds(track);
  return (track.requiredGates || [])
    .filter((gate) => gate?.required !== false)
    .filter((gate) => !passed.has(gate.id))
    .map((gate) => gate.id);
}

export function passedGlobalGateIds(plan) {
  return new Set(
    (plan.globalEvidence || [])
      .filter((item) => item && item.status === "passed" && item.gateId)
      .map((item) => item.gateId),
  );
}

export function missingGlobalRequiredGates(plan) {
  const passed = passedGlobalGateIds(plan);
  return (plan.globalRequiredGates || [])
    .filter((gate) => gate?.required !== false)
    .filter((gate) => !passed.has(gate.id))
    .map((gate) => gate.id);
}

export function validatePlanShape(plan) {
  const errors = [];
  if (!plan || typeof plan !== "object") errors.push("plan must be an object");
  if (!Array.isArray(plan?.tracks)) errors.push("tracks must be an array");
  for (const gate of plan?.globalRequiredGates || []) {
    if (!gate.id) errors.push("globalRequiredGates: gate id is missing");
    if (!gate.command) errors.push(`globalRequiredGates: command is missing for ${gate.id}`);
  }
  for (const evidence of plan?.globalEvidence || []) {
    if (!evidence.gateId) errors.push("globalEvidence.gateId is required");
    if (!EVIDENCE_STATUS_VALUES.has(evidence.status)) {
      errors.push(`globalEvidence: invalid evidence status ${evidence.status}`);
    }
    if (!evidence.completedAt) errors.push("globalEvidence.completedAt is required");
  }
  for (const track of plan?.tracks || []) {
    if (!track.id) errors.push("track.id is required");
    if (!STATUS_VALUES.has(track.status)) errors.push(`${track.id}: invalid status ${track.status}`);
    for (const gate of track.requiredGates || []) {
      if (!gate.id) errors.push(`${track.id}: required gate id is missing`);
      if (!gate.command) errors.push(`${track.id}: required gate command is missing for ${gate.id}`);
    }
    for (const evidence of track.evidence || []) {
      if (!evidence.gateId) errors.push(`${track.id}: evidence.gateId is required`);
      if (!EVIDENCE_STATUS_VALUES.has(evidence.status)) {
        errors.push(`${track.id}: invalid evidence status ${evidence.status}`);
      }
      if (!evidence.completedAt) errors.push(`${track.id}: evidence.completedAt is required`);
    }
  }
  return errors;
}

export function collectReleaseBlockers(plan) {
  const blockers = [];
  for (const gateId of missingGlobalRequiredGates(plan)) {
    blockers.push({ trackId: "__global__", reason: `required gate is missing passed evidence: ${gateId}` });
  }
  for (const track of plan.tracks || []) {
    if (!track.releaseBlocker) continue;
    if (track.status !== "done") {
      blockers.push({ trackId: track.id, reason: `status is ${track.status}` });
    }
    for (const gateId of missingRequiredGates(track)) {
      blockers.push({ trackId: track.id, reason: `required gate is missing passed evidence: ${gateId}` });
    }
    for (const reason of track.releaseBlockers || []) {
      blockers.push({ trackId: track.id, reason: String(reason) });
    }
    const e2e = track.e2eFunctional;
    if (e2e && e2e.status && e2e.status !== "not_required" && e2e.status !== "passed") {
      blockers.push({ trackId: track.id, reason: `e2eFunctional status is ${e2e.status}` });
    }
    const requiredFeatures = e2e?.requiredFeatures || [];
    const manifestPaths = e2e?.manifestPaths || [];
    if (requiredFeatures.length > 0 && e2e?.status === "passed" && manifestPaths.length === 0) {
      blockers.push({
        trackId: track.id,
        reason: "e2eFunctional requiredFeatures are set but manifestPaths is empty",
      });
    }
    const seenManifestFeatures = new Set();
    for (const manifestPath of e2e?.manifestPaths || []) {
      if (!fs.existsSync(manifestPath)) {
        blockers.push({ trackId: track.id, reason: `E2E manifest does not exist: ${manifestPath}` });
        continue;
      }
      try {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
        if (manifest.feature) {
          seenManifestFeatures.add(manifest.feature);
        }
        if (requiredFeatures.length > 0 && manifest.targetEnv !== "local") {
          blockers.push({ trackId: track.id, reason: `E2E manifest targetEnv is not local: ${manifestPath}` });
        }
        if (manifest.status !== "passed") {
          blockers.push({ trackId: track.id, reason: `E2E manifest is not passed: ${manifestPath}` });
        }
        if (e2e?.snapshotHash && manifest.snapshotHash !== e2e.snapshotHash) {
          blockers.push({ trackId: track.id, reason: `E2E manifest snapshotHash is stale: ${manifestPath}` });
        }
        if (manifest.browserRequired && manifest.playwrightStatus !== "passed") {
          blockers.push({ trackId: track.id, reason: `Playwright manifest is not passed: ${manifestPath}` });
        }
      } catch (error) {
        blockers.push({ trackId: track.id, reason: `E2E manifest is unreadable: ${manifestPath}: ${error.message}` });
      }
    }
    for (const feature of requiredFeatures) {
      if (e2e?.status === "passed" && !seenManifestFeatures.has(feature)) {
        blockers.push({ trackId: track.id, reason: `E2E manifest is missing required feature: ${feature}` });
      }
    }
  }
  return blockers;
}
