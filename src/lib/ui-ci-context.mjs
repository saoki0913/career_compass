import fs from "node:fs";
import { execFileSync } from "node:child_process";

function normalizePath(value) {
  return value.replaceAll("\\", "/").trim();
}

function uniqueStrings(values) {
  return [...new Set(values.filter(Boolean))];
}

export function readGitHubEventPayload(env = process.env) {
  const eventPath = env.GITHUB_EVENT_PATH?.trim();
  if (!eventPath) {
    return null;
  }

  try {
    const raw = fs.readFileSync(eventPath, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function getGitDiffRange(env = process.env) {
  const eventName = env.GITHUB_EVENT_NAME?.trim();

  if (eventName === "pull_request" || eventName === "pull_request_target") {
    const payload = readGitHubEventPayload(env);
    const baseSha = payload?.pull_request?.base?.sha?.trim();
    const headSha = payload?.pull_request?.head?.sha?.trim();
    if (baseSha && headSha) {
      return { baseSha, headSha, range: `${baseSha}...${headSha}` };
    }
  }

  if (eventName === "push") {
    const beforeSha = env.GITHUB_EVENT_BEFORE?.trim() || readGitHubEventPayload(env)?.before?.trim();
    const headSha = env.GITHUB_SHA?.trim();
    if (beforeSha && headSha) {
      return { baseSha: beforeSha, headSha, range: `${beforeSha}...${headSha}` };
    }
  }

  const headSha = env.GITHUB_SHA?.trim() || null;
  return headSha ? { baseSha: null, headSha, range: headSha } : null;
}

export function collectChangedFiles({ cwd = process.cwd(), env = process.env, explicitFiles = [] } = {}) {
  if (explicitFiles.length > 0) {
    return uniqueStrings(explicitFiles.map(normalizePath));
  }

  const gitDiff = getGitDiffRange(env);
  const diffArgs = gitDiff
    ? ["diff", "--name-only", "--diff-filter=ACMR", gitDiff.range]
    : ["diff", "--name-only", "--diff-filter=ACMR", "HEAD"];

  try {
    const output = execFileSync("git", diffArgs, {
      cwd,
      encoding: "utf8",
    });
    return uniqueStrings(
      output
        .split(/\r?\n/)
        .map((line) => normalizePath(line))
        .filter(Boolean)
    );
  } catch {
    return [];
  }
}

