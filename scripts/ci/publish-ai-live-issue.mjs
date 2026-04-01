#!/usr/bin/env node

import { readFileSync } from "node:fs";

export function buildIssueTitle(issueDate) {
  return `AI Live Daily Report ${issueDate}`;
}

export function findExistingIssueByTitle(issues, title) {
  return issues.find((issue) => issue.title === title) ?? null;
}

async function githubRequest(pathname, { method = "GET", token, body } = {}) {
  const response = await fetch(`https://api.github.com${pathname}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
      "User-Agent": "career-compass-ai-live",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    throw new Error(`GitHub API ${method} ${pathname} failed: ${response.status} ${await response.text()}`);
  }

  return response.status === 204 ? null : response.json();
}

async function listArtifacts(repo, runId, token) {
  if (!runId) return [];
  const payload = await githubRequest(`/repos/${repo}/actions/runs/${runId}/artifacts?per_page=100`, { token });
  const artifacts = Array.isArray(payload?.artifacts) ? payload.artifacts : [];
  return artifacts.map((artifact) => ({
    name: artifact.name,
    url: `https://github.com/${repo}/actions/runs/${runId}/artifacts/${artifact.id}`,
  }));
}

export function filterPublicArtifacts(artifacts) {
  return artifacts.filter((artifact) => !artifact.name.startsWith("ai-live-internal-"));
}

export function appendArtifactLinks(body, artifacts) {
  const publicArtifacts = filterPublicArtifacts(artifacts);
  if (publicArtifacts.length === 0) return body;
  return [
    body.trimEnd(),
    "",
    "## Artifact Links",
    "",
    ...publicArtifacts.map((artifact) => `- [${artifact.name}](${artifact.url})`),
    "",
  ].join("\n");
}

function parseArgs(argv) {
  const out = {
    repo: process.env.GITHUB_REPOSITORY || "",
    issueDate: "",
    issueBodyFile: "",
    runId: process.env.GITHUB_RUN_ID || "",
    token: process.env.GITHUB_TOKEN || "",
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--repo") {
      out.repo = argv[i + 1] || out.repo;
      i += 1;
      continue;
    }
    if (arg === "--issue-date") {
      out.issueDate = argv[i + 1] || out.issueDate;
      i += 1;
      continue;
    }
    if (arg === "--issue-body-file") {
      out.issueBodyFile = argv[i + 1] || out.issueBodyFile;
      i += 1;
      continue;
    }
    if (arg === "--run-id") {
      out.runId = argv[i + 1] || out.runId;
      i += 1;
      continue;
    }
  }

  return out;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!options.repo || !options.issueDate || !options.issueBodyFile || !options.token) {
    throw new Error("Missing required arguments: --repo, --issue-date, --issue-body-file and GITHUB_TOKEN");
  }

  const title = buildIssueTitle(options.issueDate);
  const rawBody = readFileSync(options.issueBodyFile, "utf8");
  const artifacts = await listArtifacts(options.repo, options.runId, options.token);
  const body = appendArtifactLinks(rawBody, artifacts);
  const existingIssues = await githubRequest(`/repos/${options.repo}/issues?state=open&per_page=100`, {
    token: options.token,
  });
  const existing = findExistingIssueByTitle(existingIssues, title);

  if (existing) {
    const updated = await githubRequest(`/repos/${options.repo}/issues/${existing.number}`, {
      method: "PATCH",
      token: options.token,
      body: { title, body },
    });
    process.stdout.write(`updated issue #${updated.number}\n`);
    return;
  }

  const created = await githubRequest(`/repos/${options.repo}/issues`, {
    method: "POST",
    token: options.token,
    body: { title, body },
  });
  process.stdout.write(`created issue #${created.number}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
