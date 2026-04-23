#!/usr/bin/env node

import process from "node:process";
import {
  evaluateVerificationState,
  formatVerificationStatus,
  readVerificationState,
} from "../src/lib/verification-harness.mjs";

async function main() {
  const state = await readVerificationState(process.cwd(), process.env);
  const evaluation = evaluateVerificationState(state);
  process.stdout.write(`${formatVerificationStatus(state)}\n`);
  process.exit(evaluation.ok ? 0 : 1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
