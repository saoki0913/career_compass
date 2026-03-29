import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  buildAiLiveSummaryMarkdown,
  collectLatestAiLiveReports,
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
      rows: [{ case_id: "mot-1", status: "passed" }],
    },
  ]);

  assert.match(markdown, /# Nightly AI Live Summary/);
  assert.match(markdown, /live_es_review_smoke_20260329T140000Z\.json/);
  assert.match(markdown, /\| 2 \| 1 \| 1 \|/);
  assert.match(markdown, /es-2/);
  assert.match(markdown, /judge:overall_pass_false/);
});
