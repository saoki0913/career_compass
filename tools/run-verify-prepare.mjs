#!/usr/bin/env node

import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import {
  appendVerificationRun,
  getVerificationRunsDir,
  recordCheckResult,
  rebuildVerificationState,
  writeVerificationState,
} from "../src/lib/verification-harness.mjs";
import { parseUiPreflightArgs } from "../src/lib/ui-preflight-cli.mjs";

async function main() {
  const config = parseUiPreflightArgs(process.argv.slice(2));
  const runsDir = getVerificationRunsDir(process.cwd(), process.env);
  const outputPath = path.join(
    runsDir,
    `${new Date().toISOString().replaceAll(":", "-")}-ui-preflight-${config.routePath.replace(/[^a-zA-Z0-9]+/g, "-")}.md`,
  );

  const result = spawnSync("node", ["tools/run-ui-preflight.mjs", ...process.argv.slice(2)], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      UI_PREFLIGHT_OUTPUT_PATH: outputPath,
    },
    stdio: "inherit",
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }

  const state = await rebuildVerificationState(
    {
      routeOverrides: [config.routePath],
      authModeOverride: config.authMode,
    },
    process.cwd(),
    process.env,
  );
  state.stale = false;
  state.staleReason = null;
  await writeVerificationState(state, process.cwd(), process.env);
  await recordCheckResult(
    {
      id: `ui:preflight:${config.routePath}`,
      status: "passed",
      exitCode: 0,
      evidencePath: outputPath,
      message: "ui preflight recorded",
    },
    process.cwd(),
    process.env,
  );
  await appendVerificationRun(
    {
      id: `ui-preflight-${config.routePath}`,
      kind: "ui:preflight",
      route: config.routePath,
      authMode: config.authMode,
      exitCode: 0,
      markdown: "",
      evidencePath: outputPath,
    },
    process.cwd(),
    process.env,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
