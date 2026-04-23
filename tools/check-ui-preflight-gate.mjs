#!/usr/bin/env node

import process from "node:process";
import { readVerificationState, stateHasMatchingPreflight } from "../src/lib/verification-harness.mjs";

async function main() {
  const filePath = process.argv[2]?.trim() || "";
  if (!filePath) {
    process.exit(0);
  }

  const state = await readVerificationState(process.cwd(), process.env);
  if (stateHasMatchingPreflight(state, filePath)) {
    process.exit(0);
  }

  console.error("UI preflight is required before editing this file.");
  console.error("Run: npm run verify:prepare -- --route <route> --surface=marketing|product [--auth=none|guest|mock|real]");
  process.exit(2);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
