#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { buildE2EFunctionalSnapshot, getStagedFiles } from "../ci/e2e-functional-snapshot.mjs";
import {
  ALL_E2E_FUNCTIONAL_FEATURES,
  getAllE2EFunctionalFeatureConfigs,
  getE2EFunctionalCommand,
} from "../../src/lib/e2e-functional-features.mjs";
import { resolveE2EFunctionalScope } from "../../src/lib/e2e-functional-scope.mjs";

const STATUS_DIR = "backend/tests/output/local_ai_live/status";
const TEST_CATEGORIES_PREFIX = "test-categories-";

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

function parseFeatureList(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function parseE2EFunctionalDecision(raw) {
  const value = String(raw || "").trim();
  if (!value) return null;

  if (value.startsWith("{")) {
    try {
      const checkpoint = JSON.parse(value);
      const e2eValue = String(checkpoint.categories?.["e2e-functional"] || "");
      const qualityValue = String(checkpoint.categories?.quality || "");
      const e2eDecision = parseCategoryDecision(e2eValue);
      const qualityDecision = parseCategoryDecision(qualityValue);
      if (!e2eDecision && !qualityDecision) return null;
      return {
        action: e2eDecision?.action || "approve",
        runFeatures: e2eDecision?.runFeatures || [],
        skipFeatures: e2eDecision?.skipFeatures || [],
        qualityAcceptedFeatures: qualityDecision?.acceptedFeatures || [],
        snapshotHash: checkpoint.e2eFunctionalSnapshotHash || checkpoint.snapshotHash || "",
        reason: checkpoint.decision || checkpoint.status || "",
      };
    } catch {
      return null;
    }
  }

  const [action, first = "", second = "", ...rest] = value.split(":");
  if (action === "run") {
    return {
      action,
      runFeatures: parseFeatureList(first),
      skipFeatures: [],
      snapshotHash: second,
      reason: rest.join(":"),
    };
  }
  if (action === "skip") {
    return {
      action,
      runFeatures: [],
      skipFeatures: parseFeatureList(first),
      snapshotHash: second,
      reason: rest.join(":"),
    };
  }
  if (action === "partial") {
    const [snapshotHash = "", ...reasonParts] = rest;
    return {
      action,
      runFeatures: parseFeatureList(first),
      skipFeatures: parseFeatureList(second),
      snapshotHash,
      reason: reasonParts.join(":"),
    };
  }
  return null;
}

function parseCategoryDecision(value) {
  const [action, first = "", second = ""] = String(value || "").split(":");
  if (!action) return null;
  if (action === "run") {
    return {
      action,
      runFeatures: parseFeatureList(first),
      skipFeatures: [],
      acceptedFeatures: [],
    };
  }
  if (action === "skip") {
    return {
      action,
      runFeatures: [],
      skipFeatures: parseFeatureList(first),
      acceptedFeatures: [],
    };
  }
  if (action === "partial") {
    return {
      action,
      runFeatures: parseFeatureList(first),
      skipFeatures: parseFeatureList(second),
      acceptedFeatures: [],
    };
  }
  if (action === "accept") {
    return {
      action,
      runFeatures: [],
      skipFeatures: [],
      acceptedFeatures: parseFeatureList(first),
    };
  }
  return null;
}

function defaultDecisionDir() {
  const home = process.env.HOME || "";
  return home ? path.join(home, ".claude", "sessions", "career_compass") : "";
}

function readDecision({
  decisionFile = process.env.TEST_CATEGORIES_CHECKPOINT_FILE || process.env.E2E_FUNCTIONAL_DECISION_FILE,
  snapshotHash = "",
  features = [],
} = {}) {
  const candidates = [];
  if (decisionFile) {
    candidates.push(decisionFile);
  } else {
    const dirs = [
      defaultDecisionDir(),
      process.env.HOME ? path.join(process.env.HOME, ".codex", "sessions", "career_compass") : "",
    ].filter(Boolean);
    for (const dir of dirs) {
      if (!fs.existsSync(dir)) continue;
      const files = fs
        .readdirSync(dir)
        .filter((name) => name.startsWith(TEST_CATEGORIES_PREFIX))
        .map((name) => path.join(dir, name))
        .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
      candidates.push(...files);
    }
  }

  const parsedDecisions = [];
  for (const file of candidates) {
    try {
      const parsed = parseE2EFunctionalDecision(fs.readFileSync(file, "utf8"));
      if (parsed) parsedDecisions.push(parsed);
    } catch {
      // Ignore unreadable stale session files and keep looking.
    }
  }
  if (snapshotHash && features.length > 0) {
    const required = new Set(features);
    const matching = parsedDecisions.find((decision) => {
      if (decision.snapshotHash !== snapshotHash) return false;
      return [
        ...decision.runFeatures,
        ...decision.skipFeatures,
        ...(decision.qualityAcceptedFeatures || []),
      ].some((feature) =>
        required.has(feature),
      );
    });
    if (matching) return matching;
  }
  return parsedDecisions[0] || null;
}

function decisionCoversFailures(decision, failures) {
  if (!decision) return false;
  if (!decision.reason.trim()) return false;
  const skipped = new Set(decision.skipFeatures);
  const qualityAccepted = new Set(decision.qualityAcceptedFeatures || []);
  return failures.every((failure) => {
    if (failure.reason === "quality_confirmation_required" || failure.reason === "judge_confirmation_required") {
      return qualityAccepted.has("all") || qualityAccepted.has(failure.feature);
    }
    return skipped.has("all") || skipped.has(failure.feature);
  });
}

export function evaluateLocalAiE2EReadiness({
  repoRoot = process.cwd(),
  changedFiles = [],
  snapshotHash,
  readManifestImpl = readManifest,
  readDecisionImpl = (options) => readDecision(options),
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

    const BROWSER_REQUIRED_FEATURES = new Set(
      getAllE2EFunctionalFeatureConfigs()
        .filter((c) => c.browserRequired)
        .map((c) => c.feature),
    );
    if (BROWSER_REQUIRED_FEATURES.has(feature) && manifest.playwrightStatus !== "passed") {
      failures.push({
        feature,
        reason: "playwright_required",
        playwrightStatus: manifest.playwrightStatus,
      });
      continue;
    }

    if ((manifest.softFailCount || 0) > 0) {
      failures.push({
        feature,
        reason: "quality_confirmation_required",
        softFailCount: manifest.softFailCount,
      });
    }

    if ((manifest.judgeFailCount || 0) > 0) {
      failures.push({
        feature,
        reason: "judge_confirmation_required",
        judgeFailCount: manifest.judgeFailCount,
      });
    }
  }

  const rawDecision =
    failures.length > 0
      ? readDecisionImpl({ snapshotHash, features: scope.features })
      : null;
  const decision =
    typeof rawDecision === "string" ? parseE2EFunctionalDecision(rawDecision) : rawDecision;
  if (decision) {
    if (decision.snapshotHash !== snapshotHash) {
      const decisionFeatures = [...new Set([
        ...decision.runFeatures,
        ...decision.skipFeatures,
        ...(decision.qualityAcceptedFeatures || []),
      ])];
      for (const feature of decisionFeatures.length > 0 ? decisionFeatures : scope.features) {
        failures.push({
          feature,
          reason: "stale_decision",
          decisionSnapshotHash: decision.snapshotHash,
        });
      }
    } else if (decisionCoversFailures(decision, failures)) {
      return {
        ok: true,
        features: scope.features,
        failures: [],
        decision,
      };
    }
  }

  return {
    ok: failures.length === 0,
    features: scope.features,
    failures,
    ...(decision ? { decision } : {}),
  };
}

function printFailureSummary(result, snapshotHash) {
  const groupedFeatures = [...new Set(result.failures.map((failure) => failure.feature))];
  const suggestedCommand = getSuggestedCommand(groupedFeatures);
  process.stderr.write("⛔ local E2E Functional gate failed. Commit 前に AskUserQuestion で実行/スキップを選択してください。\n");
  for (const failure of result.failures) {
    const detail =
      failure.reason === "missing_manifest"
        ? "status manifest がありません"
        : failure.reason === "wrong_target_env"
          ? "local 実行の manifest ではありません"
          : failure.reason === "stale_snapshot"
            ? "staged snapshot と一致しません"
            : failure.reason === "playwright_required"
              ? `browser E2E が未通過です (playwrightStatus=${failure.playwrightStatus || "unknown"})`
              : failure.reason === "quality_confirmation_required"
                ? `quality soft fail の確認が必要です (softFailCount=${failure.softFailCount || 0})`
                : failure.reason === "judge_confirmation_required"
                  ? `LLM judge fail の確認が必要です (judgeFailCount=${failure.judgeFailCount || 0})`
              : failure.reason === "stale_decision"
                ? `AskUserQuestion checkpoint が stale です (decisionSnapshotHash=${failure.decisionSnapshotHash || "unknown"})`
                : `status=${failure.status || "failed"}`;
    process.stderr.write(`- ${failure.feature}: ${detail}\n`);
  }
  process.stderr.write("実行する場合のコマンド:\n");
  process.stderr.write(`  ${suggestedCommand}\n`);
  process.stderr.write("スキップする場合の checkpoint 例:\n");
  process.stderr.write(
    `  node scripts/harness/diff-snapshot.mjs checkpoint --kind test-categories --decision approved --project "$(pwd)" --categories "e2e-functional=skip:${groupedFeatures.join(",")},quality=skip,static=run,security=run" > ~/.codex/sessions/career_compass/test-categories-<SESSION_ID>\n`,
  );
  process.stderr.write("quality soft fail / judge fail を承認する場合の checkpoint 例:\n");
  process.stderr.write(
    `  node scripts/harness/diff-snapshot.mjs checkpoint --kind test-categories --decision approved --project "$(pwd)" --categories "e2e-functional=run:${groupedFeatures.join(",")},quality=accept:${groupedFeatures.join(",")},static=run,security=run" > ~/.codex/sessions/career_compass/test-categories-<SESSION_ID>\n`,
  );
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
      printFailureSummary(result, snapshot.snapshotHash);
      process.exit(1);
    }
  })();
}
