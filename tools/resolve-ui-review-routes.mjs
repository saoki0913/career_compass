#!/usr/bin/env node

import process from "node:process";
import { collectChangedFiles, readGitHubEventPayload } from "../src/lib/ui-ci-context.mjs";
import {
  classifyUiReviewAuthMode,
  resolveUiReviewRoutes,
} from "../src/lib/ui-review-routing.mjs";

const args = new Set(process.argv.slice(2));
const githubOutputMode = args.has("--github-output");

const changedFiles = collectChangedFiles();
const eventPayload = readGitHubEventPayload();
const prBody = eventPayload?.pull_request?.body ?? "";
const scope = resolveUiReviewRoutes({
  changedFiles,
  prBody,
  eventName: process.env.GITHUB_EVENT_NAME?.trim() || "",
});

if (githubOutputMode) {
  const outputs = {
    ui_review_should_run: String(scope.shouldRun),
    ui_review_routes_json: JSON.stringify(scope.routes),
    ui_review_auth_mode: scope.authMode || classifyUiReviewAuthMode(scope.routes),
    ui_review_reason: scope.source,
    ui_review_changed_files_json: JSON.stringify(scope.changedFiles),
  };

  for (const [key, value] of Object.entries(outputs)) {
    process.stdout.write(`${key}=${value}\n`);
  }
  process.exit(0);
}

process.stdout.write(`${JSON.stringify(scope, null, 2)}\n`);

