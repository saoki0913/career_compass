#!/usr/bin/env bash
set -euo pipefail

state_dir="${CAREER_COMPASS_STATE_DIR:-$HOME/.career-compass}"
state_file="${state_dir}/deploy-state.json"
command="${1:-show}"
shift || true

umask 077
mkdir -p "$state_dir"
chmod 700 "$state_dir"

node - "$state_file" "$command" "$@" <<'NODE'
const fs = require("node:fs");
const [stateFile, command, ...args] = process.argv.slice(2);

function readState() {
  if (!fs.existsSync(stateFile)) return { records: [], migrations: [] };
  return JSON.parse(fs.readFileSync(stateFile, "utf8"));
}

function writeState(state) {
  fs.writeFileSync(stateFile, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
}

function argValue(name) {
  const index = args.indexOf(name);
  return index === -1 ? null : args[index + 1] ?? null;
}

const state = readState();

if (command === "record") {
  state.records.push({
    at: new Date().toISOString(),
    env: argValue("--env"),
    commitSha: argValue("--sha"),
    workflowRunId: argValue("--workflow-run-id"),
    note: argValue("--note"),
  });
  writeState(state);
  process.stdout.write(`${stateFile}\n`);
} else if (command === "record-migration") {
  state.migrations.push({
    at: new Date().toISOString(),
    env: argValue("--env"),
    commitSha: argValue("--sha"),
    journalHash: argValue("--journal-hash"),
    pendingApplied: argValue("--pending-applied"),
  });
  writeState(state);
  process.stdout.write(`${stateFile}\n`);
} else if (command === "get" || command === "show") {
  process.stdout.write(`${JSON.stringify(state, null, 2)}\n`);
} else {
  process.stderr.write(`Unknown command: ${command}\n`);
  process.exit(1);
}
NODE
