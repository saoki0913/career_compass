#!/usr/bin/env node
import { parseArgs } from "node:util";
import {
  DEFAULT_PLAN_PATH,
  EVIDENCE_STATUS_VALUES,
  STATUS_VALUES,
  findTrack,
  formatJstTimestamp,
  missingRequiredGates,
  readPlan,
  validatePlanShape,
  writePlan,
} from "./plan-task-utils.mjs";

export function updateTrack(plan, options) {
  const track = findTrack(plan, options.trackId);

  if (options.status) {
    if (!STATUS_VALUES.has(options.status)) throw new Error(`Invalid status: ${options.status}`);
    if (options.status === "blocked" && !options.blocker && !(track.releaseBlockers || []).length) {
      throw new Error("blocked status requires --blocker or existing releaseBlockers[]");
    }
    if (options.status === "done") {
      const missing = missingRequiredGates(track);
      if (missing.length) {
        throw new Error(`Cannot mark ${track.id} done. Missing required gates: ${missing.join(", ")}`);
      }
      if ((track.releaseBlockers || []).length) {
        throw new Error(`Cannot mark ${track.id} done while releaseBlockers[] is not empty`);
      }
    }
    track.status = options.status;
  }

  if (options.gateId) {
    if (!options.command) throw new Error("--command is required with --gate-id");
    if (!EVIDENCE_STATUS_VALUES.has(options.gateStatus)) {
      throw new Error(`Invalid gate status: ${options.gateStatus}`);
    }
    track.evidence = track.evidence || [];
    track.evidence.push({
      gateId: options.gateId,
      command: options.command,
      status: options.gateStatus,
      completedAt: options.completedAt || formatJstTimestamp(),
      evidencePath: options.evidencePath || null,
      notes: options.notes || "",
    });
  }

  if (options.blocker) {
    track.releaseBlockers = track.releaseBlockers || [];
    track.releaseBlockers.push(options.blocker);
  }

  if (options.clearBlockers) {
    track.releaseBlockers = [];
  }

  plan.lastUpdated = options.completedAt || formatJstTimestamp();
  const errors = validatePlanShape(plan);
  if (errors.length) throw new Error(errors.join("\n"));
  return plan;
}

export function updateGlobalEvidence(plan, options) {
  if (!options.gateId) throw new Error("--gate-id is required with --global");
  if (!options.command) throw new Error("--command is required with --gate-id");
  if (!EVIDENCE_STATUS_VALUES.has(options.gateStatus)) {
    throw new Error(`Invalid gate status: ${options.gateStatus}`);
  }
  plan.globalEvidence = plan.globalEvidence || [];
  plan.globalEvidence.push({
    gateId: options.gateId,
    command: options.command,
    status: options.gateStatus,
    completedAt: options.completedAt || formatJstTimestamp(),
    evidencePath: options.evidencePath || null,
    notes: options.notes || "",
  });
  plan.lastUpdated = options.completedAt || formatJstTimestamp();
  const errors = validatePlanShape(plan);
  if (errors.length) throw new Error(errors.join("\n"));
  return plan;
}

function main() {
  const { values } = parseArgs({
    options: {
      plan: { type: "string", default: DEFAULT_PLAN_PATH },
      track: { type: "string" },
      global: { type: "boolean", default: false },
      status: { type: "string" },
      "gate-id": { type: "string" },
      command: { type: "string" },
      "gate-status": { type: "string", default: "passed" },
      "evidence-path": { type: "string" },
      notes: { type: "string" },
      blocker: { type: "string" },
      "clear-blockers": { type: "boolean", default: false },
      "completed-at": { type: "string" },
      "dry-run": { type: "boolean", default: false },
    },
  });

  const plan = readPlan(values.plan);
  const updateOptions = {
    trackId: values.track,
    status: values.status,
    gateId: values["gate-id"],
    command: values.command,
    gateStatus: values["gate-status"],
    evidencePath: values["evidence-path"],
    notes: values.notes,
    blocker: values.blocker,
    clearBlockers: values["clear-blockers"],
    completedAt: values["completed-at"],
  };
  if (values.global) {
    updateGlobalEvidence(plan, updateOptions);
  } else {
    if (!values.track) throw new Error("--track is required");
    updateTrack(plan, updateOptions);
  }

  if (values["dry-run"]) {
    process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
  } else {
    writePlan(plan, values.plan);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
