#!/usr/bin/env node

import { execSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import readline from "node:readline";
import { buildE2EFunctionalSnapshot, getStagedFiles } from "../ci/e2e-functional-snapshot.mjs";
import {
  ALL_E2E_FUNCTIONAL_FEATURES,
  getE2EFunctionalCommand,
} from "../../src/lib/e2e-functional-features.mjs";
import { resolveE2EFunctionalScope } from "../../src/lib/e2e-functional-scope.mjs";

const STATUS_DIR = "backend/tests/output/local_ai_live/status";

function readManifest(repoRoot, feature) {
  const manifestPath = path.join(repoRoot, STATUS_DIR, `${feature}.json`);
  if (!fs.existsSync(manifestPath)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch {
    return null;
  }
}

function getSuggestedCommand(features) {
  if (features.length === ALL_E2E_FUNCTIONAL_FEATURES.length) {
    return getE2EFunctionalCommand("all", "local");
  }

  if (features.length === 1) {
    return getE2EFunctionalCommand(features[0], "local");
  }

  return features.map((feature) => getE2EFunctionalCommand(feature, "local")).join("\n  ");
}

export function evaluateLocalAiE2EReadiness({
  repoRoot = process.cwd(),
  changedFiles = [],
  snapshotHash,
  readManifestImpl = readManifest,
} = {}) {
  const scope = resolveE2EFunctionalScope({ changedFiles });
  if (!scope.shouldRun || scope.features.length === 0) {
    return { ok: true, features: [], failures: [] };
  }

  const failures = [];
  for (const feature of scope.features) {
    const manifest = readManifestImpl(repoRoot, feature);
    if (!manifest) {
      failures.push({
        feature,
        reason: "missing_manifest",
      });
      continue;
    }

    if (manifest.targetEnv !== "local") {
      failures.push({
        feature,
        reason: "wrong_target_env",
      });
      continue;
    }

    if (manifest.snapshotHash !== snapshotHash) {
      failures.push({
        feature,
        reason: "stale_snapshot",
        manifestSnapshotHash: manifest.snapshotHash,
      });
      continue;
    }

    if (manifest.status !== "passed") {
      failures.push({
        feature,
        reason: "feature_failed",
        status: manifest.status,
      });
      continue;
    }

    const BROWSER_REQUIRED_FEATURES = new Set([
      "es-review", "gakuchika", "motivation", "interview", "pages-smoke",
    ]);
    if (BROWSER_REQUIRED_FEATURES.has(feature) && manifest.playwrightStatus !== "passed") {
      failures.push({
        feature,
        reason: "playwright_required",
        playwrightStatus: manifest.playwrightStatus,
      });
    }
  }

  return {
    ok: failures.length === 0,
    features: scope.features,
    failures,
  };
}

function printFailureSummary(result) {
  const groupedFeatures = [...new Set(result.failures.map((failure) => failure.feature))];
  const suggestedCommand = getSuggestedCommand(groupedFeatures);
  process.stderr.write("⛔ local AI E2E gate failed. Commit 前に localhost E2E を更新してください。\n");
  for (const failure of result.failures) {
    const detail =
      failure.reason === "missing_manifest"
        ? "status manifest がありません"
        : failure.reason === "wrong_target_env"
          ? "local 実行の manifest ではありません"
          : failure.reason === "stale_snapshot"
            ? "staged snapshot と一致しません"
            : failure.reason === "playwright_required"
              ? `ES 添削 browser E2E が未通過です (playwrightStatus=${failure.playwrightStatus || "unknown"})`
              : `status=${failure.status || "failed"}`;
    process.stderr.write(`- ${failure.feature}: ${detail}\n`);
  }
  process.stderr.write("実行コマンド:\n");
  process.stderr.write(`  ${suggestedCommand}\n`);
}

function askConfirmation(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stderr });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase());
    });
  });
}

async function autoRunFeatureTests(repoRoot, failures) {
  const features = [...new Set(failures.map((f) => f.feature))];

  process.stderr.write("\n⛔ 以下の機能の E2E テストが未通過です:\n");
  for (const f of features) {
    process.stderr.write(`  - ${f}\n`);
  }
  process.stderr.write("\n");

  if (process.env.AI_E2E_AUTO_CONFIRM !== "1") {
    if (!process.stdin.isTTY) {
      process.stderr.write(
        "非インタラクティブ環境です。手動で実行してください:\n" +
        `  ${getSuggestedCommand(features)}\n` +
        "または AI_E2E_AUTO_CONFIRM=1 で自動実行を有効化してください\n"
      );
      process.exit(1);
    }
    const answer = await askConfirmation(
      "テストを実行しますか？ (y/n/s=skip commit) > "
    );
    if (answer === "s" || answer === "skip") {
      process.stderr.write("コミットを中止します\n");
      process.exit(1);
    }
    if (answer !== "y" && answer !== "yes") {
      process.stderr.write(
        "テストをスキップします。手動で実行してください:\n" +
        `  ${getSuggestedCommand(features)}\n`
      );
      process.exit(1);
    }
  }

  process.stderr.write(`🔄 AI E2E テストを実行します (${features.join(", ")})...\n`);

  const featuresArg = features.join(",");
  const cmd = `make ai-live-local SUITE=extended AI_LIVE_LOCAL_FEATURES=${featuresArg}`;
  process.stderr.write(`${cmd}\n`);
  const result = spawnSync("make", ["ai-live-local", `SUITE=extended`, `AI_LIVE_LOCAL_FEATURES=${featuresArg}`], {
    stdio: "inherit",
    cwd: repoRoot,
    timeout: 25 * 60 * 1000,
    killSignal: "SIGTERM",
    shell: false,
  });

  if (result.error?.code === "ETIMEDOUT") {
    process.stderr.write("  ⏰ テスト実行がタイムアウトしました (25分)\n");
  } else if (result.status !== 0) {
    process.stderr.write("  一部テスト失敗\n");
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  (async () => {
    const repoRoot = process.cwd();
    const changedFiles = getStagedFiles({ cwd: repoRoot });
    const snapshot = buildE2EFunctionalSnapshot({ cwd: repoRoot, files: changedFiles });
    const result = evaluateLocalAiE2EReadiness({
      repoRoot,
      changedFiles,
      snapshotHash: snapshot.snapshotHash,
    });

    if (!result.ok) {
      if (process.env.AI_E2E_AUTO_RUN === "0") {
        printFailureSummary(result);
        process.exit(1);
      }

      await autoRunFeatureTests(repoRoot, result.failures);

      const reSnapshot = buildE2EFunctionalSnapshot({ cwd: repoRoot, files: changedFiles });
      const reResult = evaluateLocalAiE2EReadiness({
        repoRoot,
        changedFiles,
        snapshotHash: reSnapshot.snapshotHash,
      });

      if (!reResult.ok) {
        printFailureSummary(reResult);
        process.exit(1);
      }

      process.stderr.write("✅ AI E2E テスト pass — コミットを続行します\n");
    }
  })();
}
