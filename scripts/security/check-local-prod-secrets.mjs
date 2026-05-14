#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { SECRET_PATTERNS } from "./secret-patterns.mjs";

const repoRoot = resolve(new URL("../..", import.meta.url).pathname);
const args = process.argv.slice(2);

function parseArgs(argv) {
  const files = [];
  let fileList = null;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--file-list") {
      fileList = argv[index + 1] || null;
      index += 1;
      continue;
    }
    files.push(arg);
  }
  return { files, fileList };
}

function trackedFiles() {
  const result = spawnSync("git", ["-C", repoRoot, "ls-files"], { encoding: "utf8" });
  if (result.status !== 0) return [];
  return result.stdout.split("\n").filter(Boolean);
}

function filesFromList(fileList) {
  if (!fileList) return [];
  try {
    return readFileSync(fileList, "utf8").split(/\r?\n/u).filter(Boolean);
  } catch {
    return [];
  }
}

function isScannable(file) {
  if (/\.(?:test|spec)\.[^.]+$/u.test(file)) return false;
  if (/(?:^|\/)(?:tests|__tests__|__mocks__|fixtures|conftest)\//u.test(file)) return false;
  return /\.(?:env\.example|example|sample|template|md|mdx|ts|tsx|js|mjs|cjs|py|sh|yml|yaml|json|sql)$/u.test(file)
    || file === ".env.example";
}
function isPlaceholder(value) {
  const assignment = value.match(/^[A-Z0-9_]+\s*[=:]\s*["']([^"']+)["']$/u);
  const candidate = assignment?.[1] || value;
  const lower = candidate.toLowerCase();
  return (
    lower.includes("placeholder")
    || lower.includes("example")
    || lower.includes("<")
    || lower.includes("change-me")
    || lower.includes("replace-me")
    || lower.includes("xxxx")
    || /^(sk_live_|sk_test_|whsec_|sk-proj-|sk-ant-|sk-)?x+$/u.test(lower.replace(/[^a-z0-9_-]/g, ""))
  );
}

function scanFile(file) {
  const abs = resolve(repoRoot, file);
  let content = "";
  try {
    content = readFileSync(abs, "utf8");
  } catch {
    return [];
  }
  const findings = [];
  for (const { name, regex } of SECRET_PATTERNS) {
    regex.lastIndex = 0;
    for (const match of content.matchAll(regex)) {
      const value = match[0] || "";
      if (isPlaceholder(value)) continue;
      const line = content.slice(0, match.index ?? 0).split(/\r?\n/u).length;
      findings.push({ file, line, type: name });
    }
  }
  return findings;
}

const { files: cliFiles, fileList } = parseArgs(args);
const requestedFiles = cliFiles.length ? cliFiles : filesFromList(fileList);
const files = (requestedFiles.length ? requestedFiles : trackedFiles()).filter(isScannable);
const findings = files.flatMap(scanFile);

if (findings.length > 0) {
  process.stderr.write("Production-like secrets detected in tracked/sample material:\n");
  for (const finding of findings) {
    process.stderr.write(`- ${finding.file}:${finding.line} ${finding.type}\n`);
  }
  process.exit(1);
}

process.stdout.write("No production-like secrets detected in tracked/sample material.\n");
