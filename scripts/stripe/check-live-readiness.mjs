#!/usr/bin/env node

import { buildAuditResult, collectManagedState, createStripeClient, loadResolvedManagedConfig, parseCliArgs, printResult } from "./shared.mjs";

async function main() {
  const args = parseCliArgs(["--target", "production", ...process.argv.slice(2)]);
  const config = await loadResolvedManagedConfig(args);
  const stripe = await createStripeClient({ environment: args.environment, config });
  const state = await collectManagedState({ stripe });
  const audit = buildAuditResult({ config, state });
  const readiness =
    audit.ok && audit.manualChecks.length === 0
      ? "ready"
      : audit.ok
        ? "manual_review_required"
        : "not_ready";

  printResult(
    {
      ...audit,
      ok: readiness === "ready",
      environment: args.environment,
      target: args.target,
      readiness,
    },
    { json: args.json },
  );

  if (readiness === "not_ready") {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error?.message ?? error);
  process.exit(1);
});
