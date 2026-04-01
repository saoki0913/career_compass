import test from "node:test";
import assert from "node:assert/strict";

import {
  appendArtifactLinks,
  buildIssueTitle,
  filterPublicArtifacts,
  findExistingIssueByTitle,
} from "./publish-ai-live-issue.mjs";

test("builds JST-based AI live daily issue title", () => {
  assert.equal(
    buildIssueTitle("2026-03-29"),
    "AI Live Daily Report 2026-03-29",
  );
});

test("finds an open issue with the exact title", () => {
  const issue = findExistingIssueByTitle(
    [
      { number: 1, title: "other issue" },
      { number: 2, title: "AI Live Daily Report 2026-03-29" },
    ],
    "AI Live Daily Report 2026-03-29",
  );

  assert.deepEqual(issue, { number: 2, title: "AI Live Daily Report 2026-03-29" });
});

test("filters internal AI live artifacts from issue links", () => {
  const artifacts = filterPublicArtifacts([
    { name: "ai-live-internal-es-review-smoke-123", url: "https://example.com/internal-es" },
    { name: "ai-live-internal-summary-smoke-123", url: "https://example.com/internal-summary" },
    { name: "ai-live-report-smoke-123", url: "https://example.com/public-report" },
  ]);

  assert.deepEqual(artifacts, [
    { name: "ai-live-report-smoke-123", url: "https://example.com/public-report" },
  ]);
});

test("appends only public artifact links to the issue body", () => {
  const body = appendArtifactLinks("# Report", [
    { name: "ai-live-internal-es-review-smoke-123", url: "https://example.com/internal-es" },
    { name: "ai-live-report-smoke-123", url: "https://example.com/public-report" },
  ]);

  assert.match(body, /ai-live-report-smoke-123/);
  assert.doesNotMatch(body, /ai-live-internal-es-review-smoke-123/);
});
