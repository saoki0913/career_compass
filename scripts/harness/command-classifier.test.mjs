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

test("treats env-example and secrets-examples templates as non-sensitive", () => {
  // Templates carry only placeholders and are git-tracked. They must be editable.
  assert.equal(classify('cat ".env.example"').readsSensitivePath, false);
  assert.equal(classify("bash -lc 'cat .env.example'").readsSensitivePath, false);
  assert.equal(
    classify('cat "scripts/release/secrets-examples/staging/nextjs.env.example"').readsSensitivePath,
    false,
  );
  assert.equal(
    classify('cat "scripts/release/secrets-examples/production/shared.env.example"').readsSensitivePath,
    false,
  );
  // Real secret files must stay sensitive (suffix/dir are definitionally non-template).
  assert.equal(classify('cat ".env.local"').readsSensitivePath, true);
  assert.equal(classify('cat ".env.production"').readsSensitivePath, true);
  assert.equal(classify('cat ".env"').readsSensitivePath, true);
  assert.equal(classify("cat .secrets/career_compass/production.env").readsSensitivePath, true);
  assert.equal(classify("cat config/tls/private.key").readsSensitivePath, true);
});

test("detects wrapped git push and force push commands", () => {
  const envPush = classify("env GIT_SSH_COMMAND=ssh git push origin develop");
  assert.equal(envPush.gitPush, true);
  assert.equal(envPush.forcePush, false);
  assert.equal(envPush.gitPushRemote, "origin");
  assert.deepEqual(envPush.gitPushRefspecs, ["develop"]);
  assert.equal(envPush.gitPushAllowedTarget, true);

  const nestedForce = classify("bash -lc 'git -c core.sshCommand=x push --force origin develop'");
  assert.equal(nestedForce.gitPush, true);
  assert.equal(nestedForce.forcePush, true);
  assert.equal(classify("git push origin HEAD:main").gitPushAllowedTarget, false);
  assert.equal(classify("git push origin +HEAD:main").forcePush, true);
  assert.equal(classify("git push --delete origin develop").forcePush, true);
  assert.equal(classify("git push --mirror origin").forcePush, true);
  assert.equal(classify("git push origin main; git push origin develop").gitPushAllowedTarget, false);
  assert.equal(
    classify("bash -lc 'git push origin main'; bash -lc 'git push origin develop'").gitPushAllowedTarget,
    false,
  );
});

test("fails closed on unsafe shell expansion", () => {
  assert.equal(classify("echo $(cat .secrets/example.env)").unsafeShellExpansion, true);
  assert.equal(classify('echo "$(cat .secrets/example.env)"').unsafeShellExpansion, true);
  assert.equal(classify("echo `cat .env.local`").unsafeShellExpansion, true);
  assert.equal(classify('echo "`cat .env.local`"').unsafeShellExpansion, true);
  assert.equal(classify("diff <(cat a) <(cat b)").unsafeShellExpansion, true);
  assert.equal(classify("TARGET=deploy-production; make $TARGET").unsafeShellExpansion, true);
  assert.equal(classify("CMD='git push origin develop'; $CMD").unsafeShellExpansion, true);
  assert.equal(classify("make ${TARGET}").unsafeShellExpansion, true);
  assert.equal(classify('set -- git push origin main; "$@"').unsafeShellExpansion, true);
  assert.equal(classify("set -- g it pu sh; $1$2 $3$4 origin main").unsafeShellExpansion, true);
  assert.equal(classify('set -- rm -rf src; "$@"').unsafeShellExpansion, true);
  assert.equal(classify("set -- r m -f r; $1$2 $3$4 src").unsafeShellExpansion, true);
  assert.equal(classify("echo '$(cat .env.local)'").unsafeShellExpansion, false);
  assert.equal(classify('node -e "process.stdout.write(\'stripe:inspect\')"').unsafeShellExpansion, false);
});

test("treats raw dotenv local env loading as sensitive and still classifies wrapped commands", () => {
  const wrappedVercel = classify("dotenv -e .env.local -- vercel deploy --prod");
  assert.equal(wrappedVercel.readsSensitivePath, true);
  assert.equal(wrappedVercel.releaseProvider, true);
  assert.equal(wrappedVercel.releaseMutating, true);

  const wrappedPush = classify("npx dotenv -e .env.local -- git push origin develop");
  assert.equal(wrappedPush.readsSensitivePath, true);
  assert.equal(wrappedPush.gitPush, true);
  assert.equal(wrappedPush.gitPushAllowedTarget, true);

  const wrappedMigration = classify("dotenv -e .env.local -- node scripts/release/run-migrations.mjs --env production --json");
  assert.equal(wrappedMigration.readsSensitivePath, true);
  assert.equal(wrappedMigration.migrationApply, true);

  assert.equal(classify("dotenv -p SENTRY_AUTH_TOKEN").readsSensitivePath, true);
  assert.equal(classify("dotenv -e .env.local -- printenv").readsSensitivePath, true);
  assert.equal(classify("npx --yes dotenv -e .env.local -- printenv").readsSensitivePath, true);
  assert.equal(classify("dotenv -- printenv").readsSensitivePath, true);
});

test("classifies Stripe and Sentry external service commands", () => {
  const stripeRead = classify("stripe events list --limit 3");
  assert.equal(stripeRead.releaseProvider, true);
  assert.equal(stripeRead.releaseReadOnly, true);
  assert.equal(stripeRead.releaseMutating, false);

  const stripeMutating = classify("stripe products create --name demo");
  assert.equal(stripeMutating.releaseProvider, true);
  assert.equal(stripeMutating.releaseMutating, true);

  const npmStripeRead = classify("npm run stripe:inspect -- --env test");
  assert.equal(npmStripeRead.releaseProvider, true);
  assert.equal(npmStripeRead.releaseReadOnly, true);

  const npmStripeLiveMutation = classify("npm run stripe:sync-products -- --env live");
  assert.equal(npmStripeLiveMutation.releaseProvider, true);
  assert.equal(npmStripeLiveMutation.releaseMutating, true);

  const sentryRead = classify("sentry issues list");
  assert.equal(sentryRead.releaseProvider, true);
  assert.equal(sentryRead.releaseReadOnly, true);
});

test("detects GitHub CLI provider mutations", () => {
  assert.equal(classify("gh pr merge 123 --squash").releaseProvider, true);
  assert.equal(classify("gh pr merge 123 --squash").releaseMutating, true);
  assert.deepEqual(classify("gh release create v1.0.0").releaseModes, ["github-release"]);
  assert.equal(classify("gh secret set FOO --body bar").secretApplyProduction, true);
  assert.deepEqual(classify("gh workflow run deploy.yml").releaseModes, ["github-workflow"]);
  assert.equal(classify("gh api -X PATCH /repos/o/r/actions/secrets/FOO").releaseMutating, true);
  assert.equal(classify("gh api -X PATCH /repos/o/r/actions/secrets/FOO").secretApplyProduction, true);
  assert.equal(classify("gh api /repos/o/r/actions/workflows/deploy.yml/dispatches -f ref=main").releaseMutating, true);
  assert.equal(classify("gh api /repos/o/r/actions/workflows/deploy.yml/dispatches --raw-field ref=main").releaseMutating, true);
});

test("keeps autonomy-relevant actions distinct from hard-deny actions", () => {
  assert.equal(classify("git push origin develop").gitPush, true);
  assert.equal(classify("git push --force origin develop").forcePush, true);
  assert.equal(classify("make deploy-production").productionPromotion, true);
  assert.deepEqual(classify("npx tsc --noEmit").testCategories, ["static"]);
  assert.equal(classify("cat .env.local").readsSensitivePath, true);
  assert.equal(classify("rm -rf src/components").unsafeDelete, true);
});

test("detects provider and release command modes", () => {
  assert.deepEqual(classify("npx vercel deploy --prod").releaseModes, ["provider"]);
  assert.deepEqual(classify("npx -y vercel deploy --prod").releaseModes, ["provider"]);
  assert.deepEqual(classify("make ops-release-check").releaseModes, ["check"]);
  assert.deepEqual(classify("make deploy-stage-all").releaseModes, ["stage-all"]);
  assert.deepEqual(classify("make deploy-migrate").releaseModes, ["production"]);
  assert.deepEqual(classify("make deploy-staging").releaseModes, ["staging"]);
  assert.deepEqual(classify("make deploy-production").releaseModes, ["production"]);
  assert.equal(classify("make doctor").releaseProvider, false);
  assert.equal(classify("make ops-release-check").releaseReadOnly, true);
  assert.equal(classify("zsh scripts/release/release-career-compass.sh --check").releaseReadOnly, true);
  assert.deepEqual(classify("zsh scripts/release/release-career-compass.sh --production").releaseModes, ["production"]);
  assert.deepEqual(classify("zsh scripts/release/release-career-compass.sh --staging-only").releaseModes, ["staging"]);
  assert.equal(classify("zsh scripts/release/release-career-compass.sh --check --staging-only").releaseReadOnly, false);
  assert.equal(classify("zsh scripts/release/release-career-compass.sh --check --staging-only").releaseMutating, true);
  assert.equal(classify("zsh scripts/release/sync-career-compass-secrets.sh --check --target all").releaseReadOnly, true);
  assert.equal(classify("zsh scripts/release/sync-career-compass-secrets.sh --check --apply --target all").releaseMutating, true);
  assert.equal(classify("zsh scripts/release/sync-career-compass-secrets.sh --apply --target vercel-production").releaseMutating, true);
  assert.equal(classify("zsh scripts/release/sync-career-compass-secrets.sh --apply").secretApplyProduction, true);
  assert.equal(classify("make ops-secrets-sync SYNC_MODE=--apply TARGET=all").secretApplyProduction, true);
  assert.equal(classify("make ops-secrets-sync SYNC_MODE=--apply").secretApplyProduction, true);
  assert.equal(classify("node scripts/release/run-migrations.mjs --env production --dry-run").releaseReadOnly, true);
  assert.equal(classify("node scripts/release/run-migrations.mjs --env production --json").migrationApply, true);
  assert.equal(classify("node scripts/release/run-migrations.mjs --env staging --json").migrationApply, true);
  assert.equal(classify("node scripts/release/run-migrations.mjs --env staging --dry-run").migrationApply, false);
  assert.equal(classify("node scripts/release/run-migrations.mjs --env local --json").migrationApply, false);
  assert.equal(classify("node scripts/release/run-migrations.mjs --json").migrationApply, false);
  assert.equal(classify("scripts/release/run-migrations.mjs --env production --json").migrationApply, true);
  assert.equal(classify("make deploy-production").productionPromotion, true);
  assert.equal(classify("scripts/release/deploy-production.sh --confirm").productionPromotion, true);
  assert.equal(classify("zsh scripts/release/release-career-compass.sh --production").productionPromotion, true);
  assert.equal(classify("make deploy-migrate").migrationApply, true);
  assert.equal(classify("npm run db:push").migrationApply, true);
  assert.equal(classify("npm run db:migrate").migrationApply, true);
  assert.equal(classify("drizzle-kit push").migrationApply, true);
  assert.equal(classify("supabase db push").migrationApply, true);
  assert.equal(classify("make ops-release-check deploy-production").releaseMutating, true);
  assert.equal(classify("make ops-release-check deploy-production").releaseReadOnly, false);
  assert.equal(classify("make ops-release-check deploy-migrate").migrationApply, true);
  assert.equal(classify("make ops-status deploy-production").productionPromotion, true);
});

test("detects secret path movement and protected checkpoint creation", () => {
  assert.equal(classify("cp .env.local /tmp/env-copy").readsSensitivePath, true);
  assert.equal(classify("tar czf /tmp/secrets.tgz .secrets").readsSensitivePath, true);
  assert.equal(classify("python3 -c 'open(\".env.local\").read()'").readsSensitivePath, true);
  assert.equal(
    classify("node scripts/harness/diff-snapshot.mjs checkpoint --kind release --decision approved").protectedCheckpoint,
    true,
  );
  assert.equal(
    classify("scripts/harness/diff-snapshot.mjs checkpoint --kind release --decision approved").protectedCheckpoint,
    true,
  );
  assert.equal(
    classify("node scripts/harness/diff-snapshot.mjs checkpoint --kind prompt-quality-verification --decision verified").protectedCheckpoint,
    false,
  );
  assert.equal(classify("vercel env add FOO production").secretApplyProduction, true);
  assert.equal(classify("railway variables --set FOO=bar").secretApplyProduction, true);
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

  const manyDocs = classifyChangePath(Array.from({ length: 12 }, (_, index) => `docs/plan/task-${index}.md`), 1200);
  assert.equal(manyDocs.changePath, "FAST_PATH");
  assert.equal(manyDocs.reason, "docs_or_static_metadata");

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

test("taxonomy subcommand returns the frozen Codex autonomy-budget sets", () => {
  const taxonomy = JSON.parse(
    execFileSync("node", [scriptPath, "taxonomy"], { cwd: repoRoot, encoding: "utf8" }),
  );
  assert.equal(taxonomy.schemaVersion, 1);
  assert.deepEqual(taxonomy.actions, [
    "test",
    "push",
    "release",
    "production-promotion",
    "edit",
    "commit",
    "migration",
  ]);
  assert.deepEqual(taxonomy.releaseModes, [
    "staging",
    "production",
    "stage-all",
    "release",
    "provider",
  ]);
  assert.ok(taxonomy.hardStop.includes("forcePush"));
  assert.ok(taxonomy.hardStop.includes("secretApplyProduction"));
  assert.ok(taxonomy.hardStop.includes("productionPromotion"));
});

test("taxonomy subcommand does not perturb the command-classify path", () => {
  // The taxonomy branch must return before classifyCommand, so a real command
  // named neither subcommand still classifies normally.
  assert.equal(classify("git push origin develop").gitPush, true);
  assert.equal(classify("taxonomy of birds").gitPush, false);
});
