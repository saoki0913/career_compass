#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { z } from "zod";

const RunModeSchema = z.enum(["plan_review", "implementation", "post_review", "imagegen"]);
const ExecutionStatusSchema = z.enum(["SUCCESS", "TIMEOUT", "CODEX_ERROR", "PARSE_FAILURE"]);
const ReviewStatusSchema = z.enum(["APPROVE", "REQUEST_CHANGES", "NEEDS_DISCUSSION"]);
const SeveritySchema = z.enum(["critical", "high", "medium", "low"]);

const MetaSchema = z.object({
  mode: RunModeSchema,
  request_id: z.string().min(1),
  model: z.string().min(1),
  timestamp: z.string().min(1),
  exit_code: z.number().int(),
  duration_ms: z.number().int().nonnegative(),
  status: ExecutionStatusSchema,
  context_file: z.string().nullable().optional(),
  timeout_sec: z.number().int().positive(),
  image_count: z.number().int().nonnegative().optional(),
});

const SnapshotSchema = z.object({
  headSha: z.string(),
  stagedDiffHash: z.string(),
  files: z.array(z.string()),
});

const REVIEW_STATUS_VALUES = new Set(ReviewStatusSchema.options);
const SEVERITY_RANK = { low: 1, medium: 2, high: 3, critical: 4 };
const INTERNAL_DISPLAY_PATTERNS = [
  /\bSESSION_ID\b/u,
  /\bstagedDiffHash\b/u,
  /\bheadSha\b/u,
  /\btool_input\b/u,
  /\bmeta\.json\b/u,
  /\breview\.json\b/u,
  /\bcheckpoint\b/iu,
];

function argValue(name, fallback = "") {
  const index = process.argv.indexOf(name);
  if (index === -1 || index + 1 >= process.argv.length) return fallback;
  return process.argv[index + 1];
}

function readJson(filePath, schema) {
  return schema.parse(JSON.parse(readFileSync(filePath, "utf8")));
}

function optionalFile(pathname) {
  return existsSync(pathname) ? pathname : undefined;
}

function readTextIfExists(pathname) {
  return existsSync(pathname) ? readFileSync(pathname, "utf8") : "";
}

function runGitSnapshot(project) {
  const result = spawnSync("node", [
    path.join(project, "scripts/harness/diff-snapshot.mjs"),
    "current",
    "--project",
    project,
  ], { cwd: project, encoding: "utf8" });
  if (result.status !== 0) {
    return { headSha: "", stagedDiffHash: "", files: [] };
  }
  return SnapshotSchema.parse(JSON.parse(result.stdout));
}

export function parseReviewMarkdown(result) {
  const parseWarnings = [];
  const statusMatch = result.match(/##\s*(?:Status|状態|結果)\s*\n+([A-Z_]+)/u);
  const rawStatus = statusMatch?.[1] ?? "";
  const reviewStatus = REVIEW_STATUS_VALUES.has(rawStatus) ? rawStatus : "NEEDS_DISCUSSION";
  if (!rawStatus) {
    parseWarnings.push("レビュー結果の状態行を読み取れませんでした。");
  } else if (reviewStatus !== rawStatus) {
    parseWarnings.push("レビュー結果の状態が想定外だったため、確認が必要な状態として扱いました。");
  }

  let maxSeverity = "";
  const findings = [];
  const findingPattern =
    /-\s*severity:\s*(critical|high|medium|low)\s*\|\s*(?:file:)?([^|\n]+?)\s*\|\s*([^\n]+)/giu;
  for (const match of result.matchAll(findingPattern)) {
    const severity = match[1].toLowerCase();
    const location = match[2].trim();
    const message = match[3].trim();
    if (!maxSeverity || SEVERITY_RANK[severity] > SEVERITY_RANK[maxSeverity]) {
      maxSeverity = severity;
    }
    const lineMatch = location.match(/^(.*?):(\d+)$/u);
    findings.push({
      severity,
      ...(lineMatch ? { file: lineMatch[1], line: Number.parseInt(lineMatch[2], 10) } : { file: location }),
      message,
    });
  }

  return {
    reviewStatus,
    maxSeverity,
    findings,
    parseWarnings,
  };
}

export function buildRunArtifact({ meta, resultDir, project }) {
  const stderrTmp = optionalFile(path.join(resultDir, "stderr.tmp"));
  const imagesJson = optionalFile(path.join(resultDir, "images.json"));
  return {
    schemaVersion: 1,
    requestId: meta.request_id,
    mode: meta.mode,
    status: meta.status,
    model: meta.model,
    createdAt: meta.timestamp,
    durationMs: meta.duration_ms,
    timeoutSec: meta.timeout_sec,
    paths: {
      requestMd: path.join(resultDir, "request.md"),
      resultMd: path.join(resultDir, "result.md"),
      metaJson: path.join(resultDir, "meta.json"),
      ...(meta.mode === "post_review" ? { reviewJson: path.join(resultDir, "review.json") } : {}),
      ...(stderrTmp ? { stderrTmp } : {}),
      ...(imagesJson ? { imagesJson } : {}),
    },
    diagnostics: {
      exitCode: meta.exit_code,
      project,
      ...(meta.context_file ? { contextFile: meta.context_file } : {}),
    },
  };
}

export function buildReviewArtifact({ meta, result, snapshot }) {
  const parsed = parseReviewMarkdown(result);
  return {
    schemaVersion: 1,
    requestId: meta.request_id,
    executionStatus: meta.status,
    reviewStatus: parsed.reviewStatus,
    verdict: parsed.reviewStatus.toLowerCase(),
    maxSeverity: parsed.maxSeverity,
    findings: parsed.findings,
    parseWarnings: parsed.parseWarnings,
    headSha: snapshot.headSha,
    stagedDiffHash: snapshot.stagedDiffHash,
    files: snapshot.files,
    diffBinding: {
      headSha: snapshot.headSha,
      stagedDiffHash: snapshot.stagedDiffHash,
      files: snapshot.files,
    },
    createdAt: new Date().toISOString(),
  };
}

function modeLabel(mode) {
  return {
    plan_review: "計画レビュー",
    implementation: "実装",
    post_review: "コードレビュー",
    imagegen: "画像生成",
  }[mode];
}

function statusLabel(status) {
  return {
    SUCCESS: "完了",
    TIMEOUT: "時間内に完了しませんでした",
    CODEX_ERROR: "途中で失敗しました",
    PARSE_FAILURE: "結果を読み取れませんでした",
  }[status];
}

function reviewSummary(review) {
  if (!review) return "";
  if (review.reviewStatus === "APPROVE") {
    return "レビューで大きな問題は見つかりませんでした。";
  }
  if (review.reviewStatus === "REQUEST_CHANGES") {
    const severity = review.maxSeverity ? `最大の指摘は ${review.maxSeverity} です。` : "修正が必要な指摘があります。";
    return `レビューで修正が必要な点が見つかりました。${severity}`;
  }
  return "レビュー結果の判断に確認が必要です。";
}

function nextActionFor(run, review) {
  if (run.status === "TIMEOUT") {
    return "作業内容を絞るか、時間を延ばしてもう一度実行してください。";
  }
  if (run.status === "CODEX_ERROR") {
    return "エラー内容を確認し、必要なら手元で作業を続けてください。";
  }
  if (run.status === "PARSE_FAILURE") {
    return "結果本文を確認し、判断できる内容だけを手元で引き継いでください。";
  }
  if (review?.reviewStatus === "REQUEST_CHANGES") {
    return review.maxSeverity === "high" || review.maxSeverity === "critical"
      ? "重大な指摘を修正してから次へ進んでください。"
      : "指摘内容を確認し、必要な修正または記録をしてから次へ進んでください。";
  }
  if (review?.reviewStatus === "NEEDS_DISCUSSION") {
    return "判断に迷う点を整理してから次へ進んでください。";
  }
  return "必要な確認が終わっていれば、次の作業へ進めます。";
}

export function buildDisplayArtifact({ run, review }) {
  const title = `${modeLabel(run.mode)}が${statusLabel(run.status)}`;
  const summary = reviewSummary(review) || `${modeLabel(run.mode)}の処理が${statusLabel(run.status)}。`;
  const display = {
    schemaVersion: 1,
    title,
    summary,
    statusLabel: statusLabel(run.status),
    ...(review?.maxSeverity ? { severityLabel: review.maxSeverity } : {}),
    nextAction: nextActionFor(run, review),
    artifactRef: {
      requestId: run.requestId,
      resultPath: run.paths.resultMd,
    },
  };
  const serialized = JSON.stringify(display);
  for (const pattern of INTERNAL_DISPLAY_PATTERNS) {
    if (pattern.test(serialized)) {
      throw new Error(`display artifact contains internal implementation wording: ${pattern}`);
    }
  }
  return display;
}

export function buildUserQuestionDisplay({
  question,
  recommendedOption,
  options,
  impactSummary,
}) {
  const display = {
    schemaVersion: 1,
    question,
    recommendedOption,
    options,
    impactSummary,
  };
  const serialized = JSON.stringify(display);
  for (const pattern of INTERNAL_DISPLAY_PATTERNS) {
    if (pattern.test(serialized)) {
      throw new Error(`question display contains internal implementation wording: ${pattern}`);
    }
  }
  return display;
}

function writeArtifacts() {
  const resultDir = argValue("--result-dir");
  const project = argValue("--project", process.cwd());
  if (!resultDir) {
    throw new Error("--result-dir is required");
  }

  const meta = readJson(path.join(resultDir, "meta.json"), MetaSchema);
  const result = readTextIfExists(path.join(resultDir, "result.md"));
  const run = buildRunArtifact({ meta, resultDir, project });
  writeFileSync(path.join(resultDir, "run.json"), `${JSON.stringify(run, null, 2)}\n`);

  let review = null;
  if (meta.mode === "post_review") {
    review = buildReviewArtifact({
      meta,
      result,
      snapshot: runGitSnapshot(project),
    });
    writeFileSync(path.join(resultDir, "review.json"), `${JSON.stringify(review, null, 2)}\n`);
  }

  const display = buildDisplayArtifact({ run, review });
  writeFileSync(path.join(resultDir, "display.json"), `${JSON.stringify(display, null, 2)}\n`);
  process.stdout.write(`${path.join(resultDir, "display.json")}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const command = process.argv[2] || "";
  if (command !== "write") {
    process.stderr.write("Usage: node scripts/codex/agent-dialogue.mjs write --result-dir <dir> --project <project>\n");
    process.exit(2);
  }
  try {
    writeArtifacts();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
}
