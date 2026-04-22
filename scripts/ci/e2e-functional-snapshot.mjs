#!/usr/bin/env node

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import process from "node:process";

function uniqueStrings(values) {
  return [...new Set(values.filter(Boolean))];
}

function normalizePath(value) {
  return String(value || "").replaceAll("\\", "/").trim();
}

function parseArgs(argv) {
  const options = {
    cwd: process.cwd(),
    files: [],
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--files-json") {
      try {
        options.files = JSON.parse(argv[i + 1] || "[]");
      } catch {
        options.files = [];
      }
      i += 1;
    }
  }

  return options;
}

export function getStagedFiles({ cwd = process.cwd() } = {}) {
  try {
    const output = execFileSync("git", ["diff", "--cached", "--name-only", "--diff-filter=ACMR"], {
      cwd,
      encoding: "utf8",
    });
    return uniqueStrings(output.split(/\r?\n/).map(normalizePath));
  } catch {
    return [];
  }
}

function getStagedBlob({ cwd, path }) {
  return execFileSync("git", ["show", `:${path}`], {
    cwd,
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });
}

export function buildE2EFunctionalSnapshot({
  cwd = process.cwd(),
  files = [],
} = {}) {
  const snapshotFiles = uniqueStrings(files.map(normalizePath)).sort();
  if (snapshotFiles.length === 0) {
    return {
      snapshotHash: "no-staged-files",
      snapshotFiles: [],
    };
  }

  const digest = createHash("sha256");
  for (const path of snapshotFiles) {
    digest.update(path);
    digest.update("\0");
    digest.update(getStagedBlob({ cwd, path }));
    digest.update("\0");
  }

  return {
    snapshotHash: digest.digest("hex"),
    snapshotFiles,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const options = parseArgs(process.argv.slice(2));
  const files = options.files.length > 0 ? options.files : getStagedFiles({ cwd: options.cwd });
  process.stdout.write(`${JSON.stringify(buildE2EFunctionalSnapshot({ cwd: options.cwd, files }))}\n`);
}
