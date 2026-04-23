#!/usr/bin/env node

import process from "node:process";
import {
  getE2EFunctionalCommand,
  resolveE2EFunctionalFeatureForPath,
} from "../../src/lib/e2e-functional-features.mjs";

function parseArgs(argv) {
  const options = {
    path: "",
    environment: "local",
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--path") {
      options.path = argv[i + 1] || "";
      i += 1;
      continue;
    }
    if (arg === "--environment") {
      options.environment = argv[i + 1] || options.environment;
      i += 1;
    }
  }

  return options;
}

const options = parseArgs(process.argv.slice(2));
const feature = resolveE2EFunctionalFeatureForPath(options.path);
const command = feature ? getE2EFunctionalCommand(feature, options.environment) : null;

process.stdout.write(
  `${JSON.stringify({
    feature,
    command,
  })}\n`,
);
