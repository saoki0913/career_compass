#!/usr/bin/env node

import { spawn } from "node:child_process";
import process from "node:process";
import { getPlaywrightAuthStatePath, hasPlaywrightAuthState } from "../src/lib/verification-harness.mjs";
import { buildUiReviewEnv, parseUiReviewArgs } from "../src/lib/ui-review-cli.mjs";

const npxCommand = process.platform === "win32" ? "npx.cmd" : "npx";
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

function runAuthCapture(authStatePath) {
  const capture = spawn(npmCommand, ["run", "auth:save-playwright-state", "--", `--output=${authStatePath}`], {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit",
  });

  capture.on("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }

    if ((code ?? 1) !== 0) {
      process.exit(code ?? 1);
    }

    launchUiReview(authStatePath);
  });

  capture.on("error", (error) => {
    console.error(`[ui-review] failed to capture auth state: ${error.message}`);
    process.exit(1);
  });
}

function launchUiReview(authStatePath) {
  const config = parseUiReviewArgs(process.argv.slice(2));
  const args = ["playwright", "test", "e2e/tooling/ui-review.spec.ts"];
  if (config.headed) {
    args.push("--headed");
  }

  const child = spawn(npxCommand, args, {
    cwd: process.cwd(),
    env: {
      ...process.env,
      ...buildUiReviewEnv(config),
      ...(config.authMode === "real" ? { PLAYWRIGHT_AUTH_STATE: authStatePath } : {}),
    },
    stdio: "inherit",
  });

  child.on("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }

    process.exit(code ?? 1);
  });

  child.on("error", (error) => {
    console.error(`[ui-review] failed to launch Playwright: ${error.message}`);
    process.exit(1);
  });
}

try {
  const config = parseUiReviewArgs(process.argv.slice(2));
  const authStatePath = getPlaywrightAuthStatePath(process.cwd(), process.env);
  if (config.authMode === "real" && !hasPlaywrightAuthState(process.cwd(), process.env)) {
    runAuthCapture(authStatePath);
  } else {
    launchUiReview(authStatePath);
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
}
