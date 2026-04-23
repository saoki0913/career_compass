#!/usr/bin/env node

import process from "node:process";
import {
  appendVerificationRun,
  getPlaywrightAuthStatePath,
  readVerificationState,
  rebuildVerificationState,
  recordCheckResult,
  runShellCommand,
  writeVerificationState,
} from "../src/lib/verification-harness.mjs";

function parseArgs(argv) {
  const routeOverrides = [];
  const featureOverrides = [];
  let authModeOverride = "";

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--route") {
      routeOverrides.push(argv[index + 1]);
      index += 1;
      continue;
    }
    if (arg.startsWith("--route=")) {
      routeOverrides.push(arg.slice("--route=".length));
      continue;
    }
    if (arg === "--feature") {
      featureOverrides.push(argv[index + 1]);
      index += 1;
      continue;
    }
    if (arg.startsWith("--feature=")) {
      featureOverrides.push(arg.slice("--feature=".length));
      continue;
    }
    if (arg.startsWith("--auth=")) {
      authModeOverride = arg.slice("--auth=".length).trim();
      continue;
    }
    throw new Error(`Unknown option: ${arg}`);
  }

  return { routeOverrides, featureOverrides, authModeOverride };
}

function isAutomatedCheck(check) {
  return check.kind !== "manual:review" && check.kind !== "ui:preflight";
}

async function main() {
  const config = parseArgs(process.argv.slice(2));
  const state = await rebuildVerificationState(config, process.cwd(), process.env);
  state.stale = false;
  state.staleReason = null;
  await writeVerificationState(state, process.cwd(), process.env);

  if ((state.unresolved || []).length > 0) {
    throw new Error(`Verification plan is unresolved: ${state.unresolved.join(", ")}`);
  }

  const missingPreflight = state.checks.filter(
    (check) => check.kind === "ui:preflight" && check.status !== "passed",
  );
  if (missingPreflight.length > 0) {
    throw new Error(`UI preflight is missing. Run ${missingPreflight[0].command}`);
  }

  for (const check of state.checks) {
    if (!isAutomatedCheck(check)) {
      continue;
    }

    if (check.kind === "auth-state" && check.authMode === "real") {
      const authStatePath = getPlaywrightAuthStatePath(process.cwd(), process.env);
      if (process.env.PLAYWRIGHT_AUTH_STATE?.trim() || authStatePath) {
        // Command below refreshes the state file, even if one already exists.
      }
    }

    const result = runShellCommand(check.command, process.cwd(), process.env);
    const status = result.status === 0 ? "passed" : "failed";
    await recordCheckResult(
      {
        id: check.id,
        status,
        exitCode: result.status ?? 1,
        message: check.command,
      },
      process.cwd(),
      process.env,
    );
    await appendVerificationRun(
      {
        id: check.id,
        kind: check.kind,
        route: check.route ?? null,
        feature: check.feature ?? null,
        authMode: check.authMode ?? null,
        command: check.command,
        exitCode: result.status ?? 1,
      },
      process.cwd(),
      process.env,
    );

    if (result.status !== 0) {
      process.exit(result.status ?? 1);
    }
  }

  const latest = await readVerificationState(process.cwd(), process.env);
  const pendingManual = (latest?.checks || []).filter((check) => check.kind === "manual:review" && check.status !== "passed");
  if (pendingManual.length > 0) {
    console.error("manual verification still required:");
    for (const check of pendingManual) {
      console.error(`- ${check.command}`);
    }
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
