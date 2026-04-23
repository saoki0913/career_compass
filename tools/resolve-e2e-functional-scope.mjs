#!/usr/bin/env node

import process from "node:process";
import { resolveE2EFunctionalScopeFromContext } from "../src/lib/e2e-functional-scope.mjs";

const args = new Set(process.argv.slice(2));
const githubOutputMode = args.has("--github-output");

const scope = resolveE2EFunctionalScopeFromContext();

if (githubOutputMode) {
  const outputs = {
    e2e_functional_should_run: String(scope.shouldRun),
    e2e_functional_features_json: JSON.stringify(scope.features),
    e2e_functional_reason: scope.source,
    e2e_functional_changed_files_json: JSON.stringify(scope.changedFiles),
  };

  for (const [key, value] of Object.entries(outputs)) {
    process.stdout.write(`${key}=${value}\n`);
  }
  process.exit(0);
}

process.stdout.write(`${JSON.stringify(scope, null, 2)}\n`);
