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

  process.stderr.write(`${formatVerificationStatus(state)}\n`);
  if (!evaluation.ok) {
    process.stderr.write(
      `closeout blocked: missing=${evaluation.missing.length} failed=${evaluation.failed.length} unresolved=${evaluation.unresolved.length}\n`,
    );
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
