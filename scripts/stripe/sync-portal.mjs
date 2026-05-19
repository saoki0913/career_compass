#!/usr/bin/env node

import { collectManagedState, createStripeClient, loadResolvedManagedConfig, parseCliArgs, printResult, syncPortal } from "./shared.mjs";

async function main() {
  const args = parseCliArgs(process.argv.slice(2));
  const config = await loadResolvedManagedConfig(args);
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
      target: args.target,
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
