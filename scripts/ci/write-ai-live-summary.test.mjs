import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  buildAiLiveArtifacts,
  buildAiLiveSummaryMarkdown,
  collectLatestAiLiveReports,
  writeAiLiveSummary,
} from "./write-ai-live-summary.mjs";

test("collects only the latest report per live prefix", () => {
  const root = mkdtempSync(path.join(tmpdir(), "ai-live-summary-"));
  try {
    writeFileSync(
      path.join(root, "live_es_review_smoke_20260328T140000Z.json"),
      JSON.stringify([{ case_id: "old", status: "failed" }], null, 2),
      "utf8",
    );
    writeFileSync(
      path.join(root, "live_es_review_smoke_20260329T140000Z.json"),
      JSON.stringify([{ case_id: "new", status: "passed" }], null, 2),
      "utf8",
    );
    writeFileSync(
      path.join(root, "live_gakuchika_smoke_20260329T140001Z.json"),
      JSON.stringify([{ case_id: "g1", status: "failed", deterministic_fail_reasons: ["short"] }], null, 2),
      "utf8",
    );

    const reports = collectLatestAiLiveReports(root);

    assert.equal(reports.length, 2);
    assert.deepEqual(
      reports.map((report) => path.basename(report.path)),
      [
        "live_es_review_smoke_20260329T140000Z.json",
        "live_gakuchika_smoke_20260329T140001Z.json",
      ],
    );
    assert.deepEqual(reports[0].rows, [{ case_id: "new", status: "passed" }]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("builds a concise markdown summary with pass and failure counts", () => {
  const markdown = buildAiLiveSummaryMarkdown([
    {
      path: "/tmp/live_es_review_smoke_20260329T140000Z.json",
      rows: [
        { case_id: "es-1", status: "passed" },
        { case_id: "es-2", status: "failed", deterministic_fail_reasons: ["judge:overall_pass_false"] },
      ],
    },
    {
      path: "/tmp/live_motivation_smoke_20260329T140001Z.json",
      rows: [{ case_id: "mot-1", status: "passed", severity: "degraded", judge: { reasons: ["company-fit"] } }],
    },
    {
      path: "/tmp/live_interview_smoke_20260329T140002Z.json",
      rows: [{ case_id: "int-1", status: "passed" }],
    },
  ]);

  assert.match(markdown, /# AI Live Summary/);
  assert.match(markdown, /live_es_review_smoke_20260329T140000Z\.json/);
  assert.match(markdown, /\| live_es_review_smoke_20260329T140000Z\.json \| 2 \| 1 \| 0 \| 1 \| 0 \|/);
  assert.match(markdown, /## 志望動機作成/);
  assert.match(markdown, /degraded=1/);
  assert.match(markdown, /company-fit/);
  assert.match(markdown, /es-2/);
  assert.match(markdown, /judge:overall_pass_false/);
});

test("builds actionable recommendations and issue body", () => {
  const artifacts = buildAiLiveArtifacts([
    {
      path: "/tmp/live_es_review_smoke_20260329T140000Z.json",
      payload: { displayName: "ES添削", reportType: "es_review" },
      rows: [
        { case_id: "es-1", status: "failed", deterministic_fail_reasons: ["char_count:98 not in [108,150]"] },
        { case_id: "es-2", status: "failed", deterministic_fail_reasons: ["char_count:141 not in [150,200]"] },
      ],
    },
    {
      path: "/tmp/live_gakuchika_smoke_20260329T140001Z.json",
      payload: { displayName: "ガクチカ作成", reportType: "gakuchika" },
      rows: [
        { caseId: "g1", status: "passed", severity: "degraded", judge: { reasons: ["gakuchika:question-depth"], warnings: ["会話の深掘りが弱い"] } },
      ],
    },
  ], {
    generatedAt: "2026-03-29T14:30:00.000Z",
    runUrl: "https://github.com/example/repo/actions/runs/123",
    suite: "smoke",
  });

  assert.equal(artifacts.aggregate.overall.failed, 2);
  assert.equal(artifacts.aggregate.features.es_review.priority, "high");
  assert.match(artifacts.issueBody, /AI Live Daily Report 2026-03-29/);
  assert.match(artifacts.issueBody, /ES添削/);
  assert.match(artifacts.issueBody, /文字数制御/);
  assert.match(artifacts.issueBody, /ガクチカ作成/);
  assert.match(artifacts.issueBody, /会話の深掘り/);
});

test("always renders all feature sections and flags missing reports", () => {
  const artifacts = buildAiLiveArtifacts([
    {
      path: "/tmp/live_es_review_smoke_20260329T140000Z.json",
      payload: { displayName: "ES添削", reportType: "es_review" },
      rows: [
        { case_id: "es-1", status: "failed", deterministic_fail_reasons: ["judge:overall_pass_false"] },
      ],
    },
  ], {
    generatedAt: "2026-03-29T14:30:00.000Z",
    runUrl: "https://github.com/example/repo/actions/runs/123",
    suite: "smoke",
  });

  assert.equal(artifacts.aggregate.features.es_review.status, "failed");
  assert.equal(artifacts.aggregate.features.gakuchika.status, "missing_report");
  assert.equal(artifacts.aggregate.features.motivation.status, "missing_report");
  assert.equal(artifacts.aggregate.features.interview.status, "missing_report");
  assert.match(artifacts.issueBody, /## ES添削/);
  assert.match(artifacts.issueBody, /## ガクチカ作成/);
  assert.match(artifacts.issueBody, /## 志望動機作成/);
  assert.match(artifacts.issueBody, /## 面接対策/);
  assert.match(artifacts.issueBody, /missing_report/);
  assert.match(artifacts.issueBody, /job log と artifact の回収経路を確認/);
});

test("always includes all four feature sections and missing-report guidance", () => {
  const artifacts = buildAiLiveArtifacts([
    {
      path: "/tmp/live_es_review_smoke_20260329T140000Z.json",
      payload: { displayName: "ES添削", reportType: "es_review" },
      rows: [{ case_id: "es-1", status: "passed" }],
    },
  ], {
    generatedAt: "2026-03-29T14:30:00.000Z",
    runUrl: "https://github.com/example/repo/actions/runs/123",
    suite: "smoke",
  });

  assert.match(artifacts.issueBody, /## ES添削/);
  assert.match(artifacts.issueBody, /## ガクチカ作成/);
  assert.match(artifacts.issueBody, /## 志望動機作成/);
  assert.match(artifacts.issueBody, /## 面接対策/);
  assert.match(artifacts.issueBody, /report 未生成/);
  assert.match(artifacts.issueBody, /job log と artifact の回収経路を確認/);
  assert.equal(artifacts.aggregate.features.gakuchika.status, "missing_report");
  assert.equal(artifacts.aggregate.features.motivation.status, "missing_report");
  assert.equal(artifacts.aggregate.features.interview.status, "missing_report");
});

test("writes summary markdown plus local helper files while keeping feature json reports as the public artifact source of truth", () => {
  const root = mkdtempSync(path.join(tmpdir(), "ai-live-write-summary-"));
  try {
    writeFileSync(
      path.join(root, "live_es_review_smoke_20260329T140000Z.json"),
      JSON.stringify([{ case_id: "es-1", status: "passed" }], null, 2),
      "utf8",
    );
    writeFileSync(
      path.join(root, "live_gakuchika_smoke_20260329T140001Z.json"),
      JSON.stringify([{ caseId: "g1", status: "failed", severity: "failed", deterministicFailReasons: ["missing_report"] }], null, 2),
      "utf8",
    );
    writeFileSync(
      path.join(root, "live_motivation_smoke_20260329T140002Z.json"),
      JSON.stringify([{ caseId: "m1", status: "passed", severity: "passed" }], null, 2),
      "utf8",
    );
    writeFileSync(
      path.join(root, "live_interview_smoke_20260329T140003Z.json"),
      JSON.stringify([{ caseId: "i1", status: "passed", severity: "passed" }], null, 2),
      "utf8",
    );

    writeAiLiveSummary({
      outputDir: root,
      suite: "smoke",
      runUrl: "https://github.com/example/repo/actions/runs/123",
    });

    assert.equal(existsSync(path.join(root, "ai-live-summary.json")), true);
    assert.equal(existsSync(path.join(root, "ai-live-summary.md")), true);
    assert.equal(existsSync(path.join(root, "ai-live-recommendations.json")), true);
    assert.equal(existsSync(path.join(root, "ai-live-issue-body.md")), true);
    assert.equal(existsSync(path.join(root, "live_es_review_smoke_20260329T140000Z.json")), true);

    const summary = JSON.parse(readFileSync(path.join(root, "ai-live-summary.json"), "utf8"));
    assert.equal(summary.features.es_review.reportFile, "live_es_review_smoke_20260329T140000Z.json");
    assert.equal(summary.features.gakuchika.status, "failed");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("treats extended ES quality-only failures as report-only while keeping smoke blocking", () => {
  const reports = [
    {
      path: "/tmp/live_es_review_extended_20260329T140000Z.json",
      payload: { displayName: "ES添削", reportType: "es_review" },
      rows: [
        {
          case_id: "es-1",
          status: "failed",
          failure_kind: "quality",
          deterministic_fail_reasons: ["char_count:95 not in [108,150]"],
        },
      ],
    },
    {
      path: "/tmp/live_gakuchika_extended_20260329T140001Z.json",
      payload: { displayName: "ガクチカ作成", reportType: "gakuchika" },
      rows: [{ caseId: "g1", status: "passed", severity: "passed" }],
    },
    {
      path: "/tmp/live_motivation_extended_20260329T140002Z.json",
      payload: { displayName: "志望動機作成", reportType: "motivation" },
      rows: [{ caseId: "m1", status: "passed", severity: "passed" }],
    },
    {
      path: "/tmp/live_interview_extended_20260329T140003Z.json",
      payload: { displayName: "面接対策", reportType: "interview" },
      rows: [{ caseId: "i1", status: "passed", severity: "passed" }],
    },
  ];

  const smokeArtifacts = buildAiLiveArtifacts(reports, { suite: "smoke" });
  const extendedArtifacts = buildAiLiveArtifacts(reports, { suite: "extended" });

  assert.equal(smokeArtifacts.aggregate.blockingFailureCount, 1);
  assert.equal(smokeArtifacts.aggregate.features.es_review.workflowImpact, "blocking");
  assert.equal(extendedArtifacts.aggregate.blockingFailureCount, 0);
  assert.equal(extendedArtifacts.aggregate.features.es_review.workflowImpact, "report_only");
  assert.match(extendedArtifacts.issueBody, /report-only/);
});
