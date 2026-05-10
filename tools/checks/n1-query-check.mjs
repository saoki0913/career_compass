#!/usr/bin/env node
/**
 * n1-query-check.mjs
 * Checks .ts, .tsx, .py files for N+1 query patterns.
 * Items: PERF-01
 */
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_DIR = resolve(__dirname, "../..");

function getStagedFiles(pattern) {
  const result = spawnSync("git", ["-C", PROJECT_DIR, "diff", "--cached", "--name-only"], { encoding: "utf8" });
  if (result.status !== 0) return [];
  return result.stdout.split("\n").filter(f => f.trim() && (pattern ? pattern.test(f) : true));
}

function getStagedContent(file) {
  const result = spawnSync("git", ["-C", PROJECT_DIR, "show", `:0:${file}`], { encoding: "utf8", maxBuffer: 10 * 1024 * 1024 });
  return result.status === 0 ? result.stdout : "";
}

function print(findings) {
  process.stdout.write(JSON.stringify({ findings, count: findings.length }, null, 2) + "\n");
}

/**
 * Scan TypeScript/JavaScript content for N+1 patterns.
 * Detects: for/while loops with await db/supabase/prisma,
 * and .forEach/.map with async callbacks containing db calls.
 */
function checkTypeScript(file, content, findings) {
  const lines = content.split("\n");
  const dbCallPattern = /await\s+(?:db\.|supabase\.|prisma\.)/;

  let inLoop = false;
  let loopStartLine = 0;
  let braceDepth = 0;
  let loopBraceStart = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Track for/while loop entry
    if (/^\s*(?:for\s*\(|while\s*\()/.test(line) && !inLoop) {
      inLoop = true;
      loopStartLine = i + 1;
      loopBraceStart = braceDepth;
    }

    // Track brace depth
    const opens = (line.match(/\{/g) || []).length;
    const closes = (line.match(/\}/g) || []).length;
    braceDepth += opens - closes;

    // Check for db calls inside loops
    if (inLoop && dbCallPattern.test(line)) {
      findings.push({
        item_id: "PERF-01",
        severity: "high",
        file,
        line: i + 1,
        message: `N+1 クエリの可能性: ループ内 (line ${loopStartLine}) で await db/supabase/prisma を呼んでいます`,
      });
      inLoop = false; // Only report once per loop
    }

    // Exit loop tracking when brace depth returns
    if (inLoop && braceDepth <= loopBraceStart && i > loopStartLine) {
      inLoop = false;
    }
  }

  // Detect .forEach/.map with async callback containing db calls
  // Use a multi-line window approach
  const fullText = content;
  const forEachMapPattern = /\.(?:forEach|map)\s*\(\s*async\s+(?:\([^)]*\)|[a-zA-Z_$][a-zA-Z0-9_$]*)\s*=>\s*\{/g;
  let match;
  while ((match = forEachMapPattern.exec(fullText)) !== null) {
    // Find the matching closing brace
    const start = match.index + match[0].length;
    let depth = 1;
    let pos = start;
    let body = "";
    while (pos < fullText.length && depth > 0) {
      if (fullText[pos] === "{") depth++;
      if (fullText[pos] === "}") depth--;
      if (depth > 0) body += fullText[pos];
      pos++;
    }

    if (dbCallPattern.test(body)) {
      const lineNum = fullText.slice(0, match.index).split("\n").length;
      findings.push({
        item_id: "PERF-01",
        severity: "high",
        file,
        line: lineNum,
        message: "N+1 クエリの可能性: .forEach/.map の async コールバック内で await db/supabase/prisma を呼んでいます",
      });
    }
  }
}

/**
 * Scan Python content for N+1 patterns.
 * Detects: for loops with await/sync db calls.
 */
function checkPython(file, content, findings) {
  const lines = content.split("\n");
  const dbCallPattern = /(?:await\s+)?(?:db\.|session\.|cursor\.|connection\.|supabase\.).*(?:execute|query|select|insert|update|delete|fetch)/;

  let inForLoop = false;
  let forIndent = 0;
  let forStartLine = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trimStart();
    const indent = line.length - trimmed.length;

    // Detect for/async for loop
    if (/^(?:async\s+)?for\s+/.test(trimmed)) {
      inForLoop = true;
      forIndent = indent;
      forStartLine = i + 1;
      continue;
    }

    // Check if we've exited the loop (dedent)
    if (inForLoop && trimmed.length > 0 && indent <= forIndent) {
      inForLoop = false;
    }

    // Check for db calls inside loop
    if (inForLoop && dbCallPattern.test(line)) {
      findings.push({
        item_id: "PERF-01",
        severity: "high",
        file,
        line: i + 1,
        message: `N+1 クエリの可能性: for ループ内 (line ${forStartLine}) で DB クエリを呼んでいます`,
      });
      inForLoop = false;
    }
  }
}

function run() {
  const findings = [];
  const codePattern = /\.(?:tsx?|py)$/;
  const files = getStagedFiles(codePattern);

  for (const file of files) {
    // Skip test files
    if (/(?:test|spec|mock|fixture|__tests__|__mocks__|e2e\/|backend\/tests\/)/i.test(file)) continue;

    const content = getStagedContent(file);
    if (!content) continue;

    if (/\.py$/.test(file)) {
      checkPython(file, content, findings);
    } else {
      checkTypeScript(file, content, findings);
    }
  }

  print(findings);
}

try {
  run();
} catch {
  print([]);
}
