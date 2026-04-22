#!/usr/bin/env node

import process from "node:process";
import { markVerificationStale } from "../src/lib/verification-harness.mjs";

function parseArgs(argv) {
  const result = {
    filePath: "",
    sessionId: "",
    agent: "unknown",
  };

  for (const arg of argv) {
    if (arg.startsWith("--file=")) {
      result.filePath = arg.slice("--file=".length).trim();
      continue;
    }
    if (arg.startsWith("--session=")) {
      result.sessionId = arg.slice("--session=".length).trim();
      continue;
    }
    if (arg.startsWith("--agent=")) {
      result.agent = arg.slice("--agent=".length).trim();
      continue;
    }
  }
  return result;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  await markVerificationStale(args, process.cwd(), process.env);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
