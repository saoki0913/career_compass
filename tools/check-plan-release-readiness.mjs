#!/usr/bin/env node
import { parseArgs } from "node:util";
import { DEFAULT_PLAN_PATH, collectReleaseBlockers, readPlan, validatePlanShape } from "./plan-task-utils.mjs";

export function checkReleaseReadiness(plan) {
  const shapeErrors = validatePlanShape(plan);
  const blockers = [
    ...shapeErrors.map((reason) => ({ trackId: "__schema__", reason })),
    ...collectReleaseBlockers(plan),
  ];
  return {
    ready: blockers.length === 0,
    blockerCount: blockers.length,
    blockers,
  };
}

function printHuman(result) {
  if (result.ready) {
    console.log("PASS: release readiness blockers are clear");
    return;
  }
  console.log(`FAIL: ${result.blockerCount} release readiness blocker(s)`);
  for (const blocker of result.blockers) {
    console.log(`- ${blocker.trackId}: ${blocker.reason}`);
  }
}

function main() {
  const { values } = parseArgs({
    options: {
      plan: { type: "string", default: DEFAULT_PLAN_PATH },
      json: { type: "boolean", default: false },
    },
  });
  const result = checkReleaseReadiness(readPlan(values.plan));
  if (values.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else {
    printHuman(result);
  }
  process.exit(result.ready ? 0 : 1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
