#!/usr/bin/env node

import { spawn } from "node:child_process";
import process from "node:process";
import { buildUiReviewEnv, parseUiReviewArgs } from "../src/lib/ui-review-cli.mjs";

const command = process.platform === "win32" ? "npx.cmd" : "npx";

try {
  const config = parseUiReviewArgs(process.argv.slice(2));
  const child = spawn(command, ["playwright", "test", "e2e/ui-review.spec.ts"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      ...buildUiReviewEnv(config),
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
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
}
