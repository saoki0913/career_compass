import test from "node:test";
import assert from "node:assert/strict";

import {
  buildIssueTitle,
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
