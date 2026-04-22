#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

function parseJson(value, fallback) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function parseArgs(argv) {
  const options = {
    feature: "",
    suite: "",
    runDir: "",
    outputDir: "backend/tests/output/local_ai_live/status",
    snapshotHash: "",
    snapshotFiles: [],
    authPreflightStatus: "unknown",
    principalPreflightStatus: "unknown",
    manifestPath: "",
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const value = argv[i + 1] || "";
    switch (arg) {
      case "--feature":
        options.feature = value;
        i += 1;
        break;
      case "--suite":
        options.suite = value;
        i += 1;
        break;
      case "--run-dir":
        options.runDir = value;
        i += 1;
        break;
      case "--output-dir":
        options.outputDir = value;
        i += 1;
        break;
      case "--snapshot-hash":
        options.snapshotHash = value;
        i += 1;
        break;
      case "--snapshot-files-json":
        options.snapshotFiles = parseJson(value, []);
        i += 1;
        break;
      case "--auth-preflight-status":
        options.authPreflightStatus = value;
        i += 1;
        break;
      case "--principal-preflight-status":
        options.principalPreflightStatus = value;
        i += 1;
        break;
      case "--manifest-path":
        options.manifestPath = value;
        i += 1;
        break;
      default:
        break;
    }
  }

  return options;
}

function readRunManifest(runDir) {
  const manifestPath = path.join(runDir, "run-manifest.json");
  return parseJson(fs.readFileSync(manifestPath, "utf8"), null);
}

const options = parseArgs(process.argv.slice(2));
if (!options.feature || !options.runDir) {
  process.stderr.write("write-local-ai-status.mjs requires --feature and --run-dir\n");
  process.exit(2);
}

const runManifest = readRunManifest(options.runDir);
if (!runManifest) {
  process.stderr.write(`Missing run manifest for ${options.feature}: ${options.runDir}\n`);
  process.exit(2);
}

const outputPath =
  options.manifestPath ||
  path.join(options.outputDir, `${options.feature}.json`);

const stableManifest = {
  feature: options.feature,
  targetEnv: "local",
  suite: options.suite || runManifest.suite || "",
  status: runManifest.status || "failed",
  completedAt: new Date().toISOString(),
  runDir: options.runDir,
  snapshotHash: options.snapshotHash || "no-staged-files",
  snapshotFiles: Array.isArray(options.snapshotFiles) ? options.snapshotFiles : [],
  authPreflightStatus: options.authPreflightStatus,
  principalPreflightStatus: options.principalPreflightStatus,
  pytestStatus: runManifest.pytestStatus || "not_run",
  playwrightStatus: runManifest.playwrightStatus || "not_run",
  softFailCount: runManifest.softFailCount || 0,
  softFailReasons: runManifest.softFailReasons || [],
  judgeStatus: runManifest.judgeStatus || "not_run",
  judgeFailCount: runManifest.judgeFailCount || 0,
  steps: runManifest.steps || [],
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(stableManifest, null, 2)}\n`);
process.stdout.write(`${outputPath}\n`);
