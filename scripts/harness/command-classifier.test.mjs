import { execFileSync } from "node:child_process";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

const repoRoot = process.cwd();
const scriptPath = path.join(repoRoot, "scripts/harness/command-classifier.mjs");

function classify(command) {
  return JSON.parse(execFileSync("node", [scriptPath, command], { cwd: repoRoot, encoding: "utf8" }));
}

function classifyChangePath(files, lines = 0) {
  return JSON.parse(execFileSync("node", [
    scriptPath,
    "classify-change-path",
    "--lines",
    String(lines),
    ...files,
  ], { cwd: repoRoot, encoding: "utf8" }));
}

test("detects quoted and nested sensitive file reads", () => {
  assert.equal(classify('cat ".env.local"').readsSensitivePath, true);
  assert.equal(classify("bash -lc 'cat .env.local'").readsSensitivePath, true);
  assert.equal(classify("sed -n '1,20p' private/agent-pipeline/skills/grill-me.md").readsSensitivePath, false);
});

test("detects wrapped git push and force push commands", () => {
  const envPush = classify("env GIT_SSH_COMMAND=ssh git push origin develop");
  assert.equal(envPush.gitPush, true);
  assert.equal(envPush.forcePush, false);

  const nestedForce = classify("bash -lc 'git -c core.sshCommand=x push --force origin develop'");
  assert.equal(nestedForce.gitPush, true);
  assert.equal(nestedForce.forcePush, true);
});

test("detects provider and release command modes", () => {
  assert.deepEqual(classify("npx vercel deploy --prod").releaseModes, ["provider"]);
  assert.deepEqual(classify("make ops-release-check").releaseModes, ["check"]);
  assert.deepEqual(classify("make deploy-stage-all").releaseModes, ["stage-all"]);
});

test("detects unsafe recursive delete and allows safe cache targets", () => {
  const unsafe = classify("rm --recursive --force src");
  assert.equal(unsafe.destructiveDelete, true);
  assert.equal(unsafe.unsafeDelete, true);
  assert.equal(unsafe.safeDelete, false);

  const safe = classify("rm -rf .next node_modules");
  assert.equal(safe.destructiveDelete, true);
  assert.equal(safe.unsafeDelete, false);
  assert.equal(safe.safeDelete, true);

  const findExec = classify("find src -type f -exec rm -rf {} +");
  assert.equal(findExec.destructiveDelete, true);
  assert.equal(findExec.unsafeDelete, true);
});

test("detects E2E and quality commands through wrappers and env prefixes", () => {
  const localEnv = classify("AI_LIVE_LOCAL_FEATURES=gakuchika bash scripts/dev/run-ai-live-local.sh");
  assert.deepEqual(localEnv.testCategories, ["e2e-functional"]);
  assert.deepEqual(localEnv.testFeatures, ["gakuchika"]);

  const npmLocal = classify("npm run test:e2e:functional:local:gakuchika");
  assert.deepEqual(npmLocal.testCategories, ["e2e-functional"]);
  assert.deepEqual(npmLocal.testFeatures, ["gakuchika"]);

  const stagingMake = classify("make test-e2e-functional-gakuchika");
  assert.deepEqual(stagingMake.testCategories, ["e2e-functional"]);
  assert.deepEqual(stagingMake.testFeatures, ["gakuchika"]);

  const stagingScript = classify("bash scripts/ci/run-e2e-functional.sh --features motivation");
  assert.deepEqual(stagingScript.testCategories, ["e2e-functional"]);
  assert.deepEqual(stagingScript.testFeatures, ["motivation"]);

  const quality = classify("AI_LIVE_TEST_CATEGORY=quality AI_LIVE_FEATURE=all bash scripts/ci/run-ai-live.sh");
  assert.deepEqual(quality.testCategories, ["quality"]);
  assert.deepEqual(quality.testFeatures, ["all"]);
  assert.deepEqual(quality.testCategoryFeatures.quality, ["all"]);

  const npmQuality = classify("npm run test:quality:all");
  assert.deepEqual(npmQuality.testCategories, ["quality"]);
  assert.deepEqual(npmQuality.testFeatures, ["all"]);
  assert.deepEqual(npmQuality.testCategoryFeatures.quality, ["all"]);

  const npmSecurity = classify("npm run test:security:light");
  assert.deepEqual(npmSecurity.testCategories, ["security"]);

  const npmStatic = classify("npm run test:static");
  assert.deepEqual(npmStatic.testCategories, ["static"]);

  const npmLint = classify("npm run lint");
  assert.deepEqual(npmLint.testCategories, ["static"]);

  const typecheck = classify("npx tsc --noEmit");
  assert.deepEqual(typecheck.testCategories, ["static"]);

  const makeVariable = classify("make test-e2e-functional-local AI_LIVE_LOCAL_FEATURES=motivation");
  assert.deepEqual(makeVariable.testCategories, ["e2e-functional"]);
  assert.deepEqual(makeVariable.testFeatures, ["motivation"]);

  const makeVariableBeforeTarget = classify("make AI_LIVE_LOCAL_FEATURES=motivation test-e2e-functional-local");
  assert.deepEqual(makeVariableBeforeTarget.testCategories, ["e2e-functional"]);
  assert.deepEqual(makeVariableBeforeTarget.testFeatures, ["motivation"]);

  const makeVariableAroundTarget = classify("make AI_LIVE_LOCAL_FEATURES=gakuchika test-e2e-functional-local SUITE=smoke");
  assert.deepEqual(makeVariableAroundTarget.testCategories, ["e2e-functional"]);
  assert.deepEqual(makeVariableAroundTarget.testFeatures, ["gakuchika"]);

  const runAiLiveFlag = classify("AI_LIVE_TEST_CATEGORY=quality bash scripts/ci/run-ai-live.sh --feature motivation");
  assert.deepEqual(runAiLiveFlag.testCategories, ["quality"]);
  assert.deepEqual(runAiLiveFlag.testFeatures, ["motivation"]);
  assert.deepEqual(runAiLiveFlag.testCategoryFeatures.quality, ["motivation"]);

  const mixed = classify(
    "AI_LIVE_LOCAL_FEATURES=motivation bash scripts/dev/run-ai-live-local.sh && AI_LIVE_TEST_CATEGORY=quality bash scripts/ci/run-ai-live.sh --feature gakuchika",
  );
  assert.deepEqual(mixed.testCategories, ["e2e-functional", "quality"]);
  assert.deepEqual(mixed.testCategoryFeatures["e2e-functional"], ["motivation"]);
  assert.deepEqual(mixed.testCategoryFeatures.quality, ["gakuchika"]);
});

test("classifies docs and metadata changes as fast path without weakening infra paths", () => {
  const fast = classifyChangePath(["docs/plan/test-quality-gate-plan.md", "docs/plan/tasks.json"], 12);
  assert.equal(fast.changePath, "FAST_PATH");
  assert.equal(fast.reason, "docs_or_static_metadata");

  const infra = classifyChangePath([".claude/hooks/pre-tool-dispatcher.sh", "docs/plan/tasks.json"], 5);
  assert.equal(infra.changePath, "INFRA_PATH");
  assert.equal(infra.reason, "infra_path");
});

test("classifies large or hotspot changes as extended path", () => {
  assert.equal(classifyChangePath(["src/hooks/useESReview.ts"], 10).changePath, "EXTENDED_PATH");
  assert.equal(
    classifyChangePath([path.join(repoRoot, "src/components/companies/CorporateInfoSection.tsx")], 10).changePath,
    "EXTENDED_PATH",
  );
  assert.equal(classifyChangePath(Array.from({ length: 10 }, (_, index) => `src/file-${index}.ts`), 10).changePath, "EXTENDED_PATH");
  assert.equal(classifyChangePath(["src/lib/example.ts"], 500).changePath, "EXTENDED_PATH");
});

test("classifies ordinary code changes as standard path", () => {
  const result = classifyChangePath(["src/bff/billing/es-review-stream-policy.test.ts"], 60);
  assert.equal(result.changePath, "STANDARD_PATH");
  assert.equal(result.reason, "default");
});
