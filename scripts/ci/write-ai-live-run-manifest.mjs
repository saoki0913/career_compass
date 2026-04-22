#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

function parseArgs(argv) {
  const options = {
    runDir: "",
    feature: "",
    suite: "",
    targetEnv: "",
    overallStatus: "failed",
    stepsJson: "[]",
    softFailCount: 0,
    softFailReasonsJson: "[]",
    judgeStatus: "not_run",
    judgeFailCount: 0,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const value = argv[i + 1] || "";
    switch (arg) {
      case "--run-dir":
        options.runDir = value;
        i += 1;
        break;
      case "--feature":
        options.feature = value;
        i += 1;
        break;
      case "--suite":
        options.suite = value;
        i += 1;
        break;
      case "--target-env":
        options.targetEnv = value;
        i += 1;
        break;
      case "--overall-status":
        options.overallStatus = value;
        i += 1;
        break;
      case "--steps-json":
        options.stepsJson = value;
        i += 1;
        break;
      case "--soft-fail-count":
        options.softFailCount = parseInt(value, 10) || 0;
        i += 1;
        break;
      case "--soft-fail-reasons-json":
        options.softFailReasonsJson = value;
        i += 1;
        break;
      case "--judge-status":
        options.judgeStatus = value;
        i += 1;
        break;
      case "--judge-fail-count":
        options.judgeFailCount = parseInt(value, 10) || 0;
        i += 1;
        break;
      default:
        break;
    }
  }

  return options;
}

function summarizeStepStatus(steps, needle) {
  const matched = steps.filter((step) => String(step.name || "").includes(needle));
  if (matched.length === 0) {
    return "not_run";
  }
  if (matched.some((step) => step.status === "failed")) {
    return "failed";
  }
  if (matched.some((step) => step.status === "passed")) {
    return "passed";
  }
  if (matched.every((step) => step.status === "skipped")) {
    return "skipped";
  }
  return "not_run";
}

const options = parseArgs(process.argv.slice(2));
const steps = JSON.parse(options.stepsJson || "[]");
const softFailReasons = JSON.parse(options.softFailReasonsJson || "[]");
const manifest = {
  feature: options.feature,
  suite: options.suite,
  targetEnv: options.targetEnv,
  status: options.overallStatus,
  completedAt: new Date().toISOString(),
  pytestStatus: summarizeStepStatus(steps, "pytest"),
  playwrightStatus: summarizeStepStatus(steps, "playwright"),
  softFailCount: options.softFailCount,
  softFailReasons,
  judgeStatus: options.judgeStatus,
  judgeFailCount: options.judgeFailCount,
  steps,
};

const manifestPath = path.join(options.runDir, "run-manifest.json");
fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
process.stdout.write(`${manifestPath}\n`);
