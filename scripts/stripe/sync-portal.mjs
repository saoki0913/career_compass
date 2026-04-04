#!/usr/bin/env node

import { collectManagedState, createStripeClient, loadManagedConfig, parseCliArgs, printResult, syncPortal } from "./shared.mjs";

async function main() {
  const args = parseCliArgs(process.argv.slice(2));
  const config = await loadManagedConfig();
  const stripe = await createStripeClient({ environment: args.environment, config });
  const state = await collectManagedState({ stripe });
  const result = await syncPortal({
    stripe,
    config,
    state,
    dryRun: args.dryRun,
  });

  printResult(
    {
      environment: args.environment,
      dryRun: args.dryRun,
      ...result,
    },
    { json: args.json },
  );
}

main().catch((error) => {
  console.error(error?.message ?? error);
  process.exit(1);
});
