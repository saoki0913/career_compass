#!/usr/bin/env node

import { buildInspectSummary, collectManagedState, createStripeClient, loadResolvedManagedConfig, parseCliArgs, printResult } from "./shared.mjs";

async function main() {
  const args = parseCliArgs(process.argv.slice(2));
  const config = await loadResolvedManagedConfig(args);
  const stripe = await createStripeClient({ environment: args.environment, config });
  const state = await collectManagedState({ stripe });

  printResult(
    {
      ok: true,
      environment: args.environment,
      target: args.target,
      summary: buildInspectSummary({ config, state }),
    },
    { json: args.json },
  );
}

main().catch((error) => {
  console.error(error?.message ?? error);
  process.exit(1);
});
