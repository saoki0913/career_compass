#!/usr/bin/env node

import { buildAuditResult, collectManagedState, createStripeClient, loadManagedConfig, printResult } from "./shared.mjs";

async function main() {
  const config = await loadManagedConfig();
  const stripe = await createStripeClient({ environment: "live", config });
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
      ok: readiness === "ready",
      environment: "live",
      readiness,
      ...audit,
    },
    { json: process.argv.includes("--json") },
  );
}

main().catch((error) => {
  console.error(error?.message ?? error);
  process.exit(1);
});
