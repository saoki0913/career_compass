import test from "node:test";
import assert from "node:assert/strict";
import {
  evaluateVerificationState,
  mergePlanWithState,
  resolveVerificationPlan,
  stateHasMatchingPreflight,
} from "../../src/lib/verification-harness.mjs";
import { parseUiPreflightArgs } from "../../src/lib/ui-preflight-cli.mjs";
import { parseUiReviewArgs } from "../../src/lib/ui-review-cli.mjs";

test("ui review CLI accepts auth=real and headed", () => {
  const parsed = parseUiReviewArgs(["/companies/ui-review-company/motivation", "--auth=real", "--headed"]);
  assert.equal(parsed.authMode, "real");
  assert.equal(parsed.headed, true);
});

test("ui preflight CLI accepts auth=real", () => {
  const parsed = parseUiPreflightArgs(["/companies/ui-review-company/motivation", "--surface=product", "--auth=real"]);
  assert.equal(parsed.authMode, "real");
});

test("verification planner requires mock UI review for generated motivation review routes", () => {
  const plan = resolveVerificationPlan({
    changedFiles: ["src/app/(product)/companies/[id]/motivation/page.tsx"],
  });

  assert.deepEqual(plan.routes, ["/companies/ui-review-company/motivation"]);
  assert.equal(plan.authMode, "mock");
  assert.doesNotMatch(JSON.stringify(plan.checks), /auth:playwright-state/);
  assert.ok(plan.checks.some((check) => check.id === "manual:review:/companies/ui-review-company/motivation"));
  assert.ok(plan.checks.some((check) => check.id === "e2e-functional:motivation"));
});

test("verification planner can require auth state for explicit real-auth routes", () => {
  const plan = resolveVerificationPlan({
    changedFiles: ["src/app/(product)/gakuchika/[id]/page.tsx"],
    routeOverrides: ["/gakuchika/real-id"],
  });

  assert.equal(plan.authMode, "real");
  assert.ok(plan.checks.some((check) => check.id === "auth:playwright-state"));
});

test("verification planner includes harness tests for harness file changes", () => {
  const plan = resolveVerificationPlan({
    changedFiles: [".codex/hooks/ui-preflight-reminder.sh"],
  });

  assert.ok(plan.checks.some((check) => check.id === "test:harness"));
});

test("stateHasMatchingPreflight checks derived UI route coverage", () => {
  const state = {
    checks: [
      {
        kind: "ui:preflight",
        route: "/companies/ui-review-company/motivation",
        status: "passed",
      },
    ],
  };

  assert.equal(
    stateHasMatchingPreflight(state, "src/app/(product)/companies/[id]/motivation/page.tsx"),
    true,
  );
  assert.equal(
    stateHasMatchingPreflight(state, "src/app/(product)/gakuchika/[id]/page.tsx"),
    false,
  );
});

test("verification evaluation fails when checks are stale or unresolved", () => {
  const plan = resolveVerificationPlan({
    changedFiles: ["src/app/(product)/companies/[id]/motivation/page.tsx"],
  });
  const merged = mergePlanWithState(plan, {
    stale: true,
    staleReason: "file changed",
    checks: [
      { id: "tsc:noemit", status: "passed" },
      { id: "lint:ui:guardrails", status: "passed" },
      { id: "ui:preflight:/companies/ui-review-company/motivation", status: "passed" },
    ],
  });
  const evaluation = evaluateVerificationState(merged);

  assert.equal(evaluation.ok, false);
  assert.ok(evaluation.missing.some((item) => item.startsWith("stale:")));
});
