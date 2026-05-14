#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import {
  DESTRUCTIVE_ANNOTATION_RE,
  DRIZZLE_MIGRATION_DIR,
  JOURNAL_PATH,
  LARGE_TABLE_ESTIMATES,
  SAFE_ANNOTATION_RE,
  SUPABASE_MIGRATION_DIR,
  listSqlFiles,
  readDrizzleJournal,
  repoPath,
  repoRoot,
} from "./migration-config.mjs";

const modes = new Set(["--all", "--staged", "--changed-files", "--pending", "--pending-tags"]);

function usage() {
  process.stderr.write(
    "Usage: check-migration-safety.mjs (--all|--staged|--changed-files <files...>|--pending <idx>|--pending-tags <tags...>) [--classify] [--json] [--allow-risky] [--allow-contract]\n",
  );
}

function lineOf(text, index) {
  return text.slice(0, index).split("\n").length;
}

export function stripSqlForScanning(sql) {
  let out = "";
  let idx = 0;
  while (idx < sql.length) {
    const ch = sql[idx];
    const next = sql[idx + 1];
    if (ch === "-" && next === "-") {
      while (idx < sql.length && sql[idx] !== "\n") {
        out += " ";
        idx += 1;
      }
      continue;
    }
    if (ch === "/" && next === "*") {
      out += "  ";
      idx += 2;
      while (idx < sql.length && !(sql[idx] === "*" && sql[idx + 1] === "/")) {
        out += sql[idx] === "\n" ? "\n" : " ";
        idx += 1;
      }
      if (idx < sql.length) {
        out += "  ";
        idx += 2;
      }
      continue;
    }
    if (ch === "'") {
      out += " ";
      idx += 1;
      while (idx < sql.length) {
        if (sql[idx] === "\n") out += "\n";
        else out += " ";
        if (sql[idx] === "'" && sql[idx + 1] === "'") {
          idx += 2;
          out += " ";
          continue;
        }
        if (sql[idx] === "'") {
          idx += 1;
          break;
        }
        idx += 1;
      }
      continue;
    }
    if (ch === '"') {
      out += ch;
      idx += 1;
      while (idx < sql.length) {
        out += sql[idx];
        if (sql[idx] === '"' && sql[idx + 1] === '"') {
          out += sql[idx + 1];
          idx += 2;
          continue;
        }
        if (sql[idx] === '"') {
          idx += 1;
          break;
        }
        idx += 1;
      }
      continue;
    }
    if (ch === "$") {
      const rest = sql.slice(idx);
      const match = /^\$[A-Za-z0-9_]*\$/.exec(rest);
      if (match) {
        const tag = match[0];
        out += " ".repeat(tag.length);
        idx += tag.length;
        const end = sql.indexOf(tag, idx);
        const bodyEnd = end === -1 ? sql.length : end;
        while (idx < bodyEnd) {
          out += sql[idx] === "\n" ? "\n" : " ";
          idx += 1;
        }
        if (end !== -1) {
          out += " ".repeat(tag.length);
          idx += tag.length;
        }
        continue;
      }
    }
    out += ch;
    idx += 1;
  }
  return out;
}

function normalizedIdentifierPattern(name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return `"${escaped}"|${escaped}`;
}

function collectSafeRecreates(stripped) {
  const safe = new Set();
  const lines = stripped.split("\n");
  const createText = stripped;
  const checks = [
    {
      kind: "trigger",
      dropRe: /DROP\s+TRIGGER\s+IF\s+EXISTS\s+"?([A-Za-z0-9_]+)"?/gi,
      createFor: (name) => new RegExp(`CREATE\\s+TRIGGER\\s+(?:${normalizedIdentifierPattern(name)})\\b`, "i"),
    },
    {
      kind: "function",
      dropRe: /DROP\s+FUNCTION\s+IF\s+EXISTS\s+"?([A-Za-z0-9_]+)"?/gi,
      createFor: (name) =>
        new RegExp(`CREATE\\s+(?:OR\\s+REPLACE\\s+)?FUNCTION\\s+(?:public\\.)?(?:${normalizedIdentifierPattern(name)})\\b`, "i"),
    },
    {
      kind: "index",
      dropRe: /DROP\s+INDEX\s+IF\s+EXISTS\s+"?([A-Za-z0-9_]+)"?/gi,
      createFor: (name) => new RegExp(`CREATE\\s+(?:UNIQUE\\s+)?INDEX\\s+(?:CONCURRENTLY\\s+)?(?:IF\\s+NOT\\s+EXISTS\\s+)?(?:${normalizedIdentifierPattern(name)})\\b`, "i"),
    },
  ];
  for (const check of checks) {
    let match;
    while ((match = check.dropRe.exec(stripped))) {
      const line = lineOf(stripped, match.index);
      const window = lines.slice(line - 1, line + 50).join("\n");
      if (check.createFor(match[1]).test(window) || check.createFor(match[1]).test(createText)) {
        safe.add(`${check.kind}:${match[1]}:${line}`);
      }
    }
  }
  return safe;
}

function pushFinding(findings, finding) {
  findings.push({
    severity: finding.severity,
    classification: finding.classification,
    rule: finding.rule,
    message: finding.message,
    line: finding.line,
  });
}

function hasSafeAnnotation(sql, index) {
  const prefix = sql.slice(Math.max(0, index - 600), index);
  return SAFE_ANNOTATION_RE.test(prefix);
}

function hasDestructiveAnnotation(sql, index) {
  const prefix = sql.slice(Math.max(0, index - 600), index);
  return DESTRUCTIVE_ANNOTATION_RE.test(prefix);
}

function addRegexFindings({ sql, stripped, findings, regex, rule, classification, severity, message, allowSafe = false, allowDestructive = false }) {
  let match;
  while ((match = regex.exec(stripped))) {
    const line = lineOf(stripped, match.index);
    if (allowSafe && hasSafeAnnotation(sql, match.index)) {
      pushFinding(findings, {
        severity: "info",
        classification: "expand-auto",
        rule: `${rule}:safe-annotation`,
        message: `${message} acknowledged by SAFE annotation`,
        line,
      });
      continue;
    }
    if (allowDestructive && hasDestructiveAnnotation(sql, match.index)) {
      pushFinding(findings, {
        severity: "error",
        classification: "manual-contract",
        rule: `${rule}:destructive-annotation`,
        message: `${message} acknowledged by DESTRUCTIVE annotation; manual contract approval is still required`,
        line,
      });
      continue;
    }
    pushFinding(findings, { severity, classification, rule, message, line });
  }
}

function statementFragments(stripped) {
  return stripped
    .split(/;|-->\s*statement-breakpoint/g)
    .map((part) => part.trim())
    .filter(Boolean);
}

export function classifySql(sql, { relativePath = "<inline>", source = "unknown" } = {}) {
  const stripped = stripSqlForScanning(sql);
  const findings = [];
  const safeRecreates = collectSafeRecreates(stripped);

  addRegexFindings({
    sql,
    stripped,
    findings,
    regex: /\bDROP\s+TABLE\b/gi,
    rule: "drop-table",
    classification: "manual-contract",
    severity: "error",
    message: "DROP TABLE requires post-deploy contract approval",
    allowDestructive: true,
  });
  addRegexFindings({
    sql,
    stripped,
    findings,
    regex: /\bALTER\s+TABLE\b[\s\S]{0,240}?\bDROP\s+COLUMN\b/gi,
    rule: "drop-column",
    classification: "manual-contract",
    severity: "error",
    message: "DROP COLUMN requires post-deploy contract approval",
    allowDestructive: true,
  });
  addRegexFindings({
    sql,
    stripped,
    findings,
    regex: /\b(TRUNCATE|DELETE\s+FROM)\b/gi,
    rule: "data-delete",
    classification: "manual-contract",
    severity: "error",
    message: "Destructive data mutation requires manual contract approval",
    allowDestructive: true,
  });
  addRegexFindings({
    sql,
    stripped,
    findings,
    regex: /\bALTER\s+TABLE\b[\s\S]{0,240}?\b(RENAME\s+(?:COLUMN|TO)|ALTER\s+COLUMN\b[\s\S]{0,160}?\bTYPE\b|ALTER\s+COLUMN\b[\s\S]{0,160}?\bSET\s+NOT\s+NULL\b)/gi,
    rule: "rewrite-or-rename",
    classification: "manual-contract",
    severity: "error",
    message: "Rewrite, rename, or SET NOT NULL operation is not expand-only",
    allowDestructive: true,
  });
  addRegexFindings({
    sql,
    stripped,
    findings,
    regex: /\bADD\s+COLUMN\b(?=[^;]*\bNOT\s+NULL\b)(?![^;]*\bDEFAULT\b)[^;]*/gi,
    rule: "add-not-null-without-default",
    classification: "manual-contract",
    severity: "error",
    message: "ADD COLUMN NOT NULL without DEFAULT is not expand-only",
    allowDestructive: true,
  });

  const riskyRules = [
    ["create-function", /\bCREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\b/gi, "Function changes require compatibility review"],
    ["create-trigger", /\bCREATE\s+(?:OR\s+REPLACE\s+)?TRIGGER\b/gi, "Trigger changes require compatibility review"],
    ["constraint-change", /\bALTER\s+TABLE\b[\s\S]{0,240}?\b(?:ADD|DROP)\s+CONSTRAINT\b/gi, "Constraint changes require compatibility review"],
    ["rls-policy", /\b(?:CREATE|ALTER|DROP)\s+POLICY\b|\b(?:ENABLE|DISABLE)\s+ROW\s+LEVEL\s+SECURITY\b/gi, "RLS policy changes require compatibility review"],
    ["plpgsql-block", /\bDO\s*\$/gi, "Arbitrary PL/pgSQL blocks require manual review"],
    ["data-write", /(?<!\bON\s)(?<!\bOR\s)\bUPDATE\b|\bINSERT\s+INTO\b/gi, "Data migrations require manual review"],
    ["privilege-change", /\b(?:GRANT|REVOKE)\b/gi, "Privilege changes require manual review"],
    ["security-definer", /\bSECURITY\s+DEFINER\b/gi, "SECURITY DEFINER requires manual review"],
  ];
  for (const [rule, regex, message] of riskyRules) {
    addRegexFindings({
      sql,
      stripped,
      findings,
      regex,
      rule,
      classification: "manual-risky",
      severity: "error",
      message,
      allowSafe: true,
    });
  }

  let dropMatch;
  const dropRe = /\bDROP\s+(TRIGGER|FUNCTION|INDEX)\s+IF\s+EXISTS\s+"?([A-Za-z0-9_]+)"?/gi;
  while ((dropMatch = dropRe.exec(stripped))) {
    const line = lineOf(stripped, dropMatch.index);
    const key = `${dropMatch[1].toLowerCase()}:${dropMatch[2]}:${line}`;
    if (safeRecreates.has(key)) {
      pushFinding(findings, {
        severity: "info",
        classification: "expand-auto",
        rule: "safe-recreate",
        message: `${dropMatch[1].toLowerCase()} ${dropMatch[2]} is recreated in the same migration`,
        line,
      });
    } else {
      pushFinding(findings, {
        severity: "error",
        classification: "manual-risky",
        rule: "drop-object",
        message: `DROP ${dropMatch[1].toUpperCase()} requires manual review`,
        line,
      });
    }
  }

  let indexMatch;
  const indexRe = /\bCREATE\s+(?:UNIQUE\s+)?INDEX\s+(?!CONCURRENTLY)(?:IF\s+NOT\s+EXISTS\s+)?("?[\w]+"?)\s+ON\s+"?([\w]+)"?/gi;
  while ((indexMatch = indexRe.exec(stripped))) {
    const tableName = indexMatch[2].replace(/"/g, "");
    if (Object.prototype.hasOwnProperty.call(LARGE_TABLE_ESTIMATES, tableName)) {
      pushFinding(findings, {
        severity: "warning",
        classification: "manual-risky",
        rule: "non-concurrent-index-large-table",
        message: `CREATE INDEX without CONCURRENTLY on large table ${tableName}`,
        line: lineOf(stripped, indexMatch.index),
      });
    }
  }

  const safeStatementCount = statementFragments(stripped).filter((stmt) =>
    /^(CREATE\s+TABLE|ALTER\s+TABLE\s+.+ADD\s+COLUMN|CREATE\s+(?:UNIQUE\s+)?INDEX\s+CONCURRENTLY|CREATE\s+(?:UNIQUE\s+)?INDEX\s+IF\s+NOT\s+EXISTS|CREATE\s+SCHEMA|COMMENT\s+ON)\b/i.test(stmt),
  ).length;

  const maxSeverity = findings.some((f) => f.severity === "error")
    ? "error"
    : findings.some((f) => f.severity === "warning")
      ? "warning"
      : "info";
  const hasContract = findings.some((f) => f.classification === "manual-contract");
  const hasRisky = findings.some((f) => f.classification === "manual-risky");
  const classification = hasContract
    ? "manual-contract"
    : hasRisky
      ? "manual-risky"
      : "expand-auto";

  return {
    relativePath,
    source,
    classification,
    maxSeverity,
    safeStatementCount,
    findings,
  };
}

function drizzleJournalErrors() {
  const errors = [];
  const journal = readDrizzleJournal();
  const seenIdx = new Set();
  const seenTags = new Set();
  for (const [pos, entry] of journal.entries.entries()) {
    if (entry.idx !== pos) errors.push(`Drizzle journal idx mismatch at position ${pos}: ${entry.idx}`);
    if (seenIdx.has(entry.idx)) errors.push(`Duplicate Drizzle journal idx: ${entry.idx}`);
    if (seenTags.has(entry.tag)) errors.push(`Duplicate Drizzle journal tag: ${entry.tag}`);
    seenIdx.add(entry.idx);
    seenTags.add(entry.tag);
    const sqlPath = repoPath(DRIZZLE_MIGRATION_DIR, `${entry.tag}.sql`);
    if (!fs.existsSync(sqlPath)) errors.push(`Missing Drizzle migration SQL for ${entry.tag}`);
  }
  return errors;
}

function filesForArgs(args) {
  const mode = args.find((arg) => modes.has(arg));
  if (!mode) throw new Error("Missing mode");
  if (mode === "--all") {
    return [
      ...listSqlFiles(DRIZZLE_MIGRATION_DIR).map((filePath) => ({ filePath, source: "drizzle" })),
      ...listSqlFiles(SUPABASE_MIGRATION_DIR).map((filePath) => ({ filePath, source: "supabase" })),
    ];
  }
  if (mode === "--changed-files") {
    const start = args.indexOf("--changed-files") + 1;
    const files = args.slice(start).filter((arg) => !arg.startsWith("--"));
    return files
      .filter((file) => file.endsWith(".sql"))
      .map((file) => ({ filePath: path.resolve(repoRoot, file), source: file.startsWith(SUPABASE_MIGRATION_DIR) ? "supabase" : "drizzle" }));
  }
  if (mode === "--staged") {
    const out = execFileSync("git", ["diff", "--cached", "--name-only"], { cwd: repoRoot, encoding: "utf8" });
    return out
      .split(/\r?\n/)
      .filter((file) => file.endsWith(".sql") && (file.startsWith(`${DRIZZLE_MIGRATION_DIR}/`) || file.startsWith(`${SUPABASE_MIGRATION_DIR}/`)))
      .map((file) => ({
        filePath: path.resolve(repoRoot, file),
        relativePath: file,
        source: file.startsWith(SUPABASE_MIGRATION_DIR) ? "supabase" : "drizzle",
        staged: true,
      }));
  }
  if (mode === "--pending") {
    const idx = Number(args[args.indexOf("--pending") + 1]);
    if (!Number.isInteger(idx)) throw new Error("--pending requires an integer idx");
    return readDrizzleJournal().entries
      .filter((entry) => entry.idx >= idx)
      .map((entry) => ({ filePath: repoPath(DRIZZLE_MIGRATION_DIR, `${entry.tag}.sql`), source: "drizzle" }));
  }
  const start = args.indexOf("--pending-tags") + 1;
  const tags = new Set(args.slice(start).filter((arg) => !arg.startsWith("--")));
  return readDrizzleJournal().entries
    .filter((entry) => tags.has(entry.tag))
    .map((entry) => ({ filePath: repoPath(DRIZZLE_MIGRATION_DIR, `${entry.tag}.sql`), source: "drizzle" }));
}

function readFileForClassification(file) {
  if (file.staged) {
    const content = execFileSync("git", ["show", `:${file.relativePath}`], { cwd: repoRoot, encoding: "utf8" });
    return content;
  }
  return fs.readFileSync(file.filePath, "utf8");
}

function shouldFail(result, { baseline, allowRisky, allowContract }) {
  if (baseline) return false;
  return result.findings.some((finding) => {
    if (finding.classification === "manual-contract") return !allowContract;
    if (finding.classification === "manual-risky") return !allowRisky;
    return finding.severity === "error";
  });
}

export function runCli(argv = process.argv.slice(2)) {
  if (argv.length === 0 || argv.includes("--help")) {
    usage();
    return 0;
  }
  const mode = argv.find((arg) => modes.has(arg));
  if (!mode) throw new Error("Missing mode");
  const classifyOnly = argv.includes("--classify");
  const json = argv.includes("--json") || classifyOnly;
  const baseline = mode === "--all";
  const allowRisky = argv.includes("--allow-risky");
  const allowContract = argv.includes("--allow-contract");
  const journalErrors = mode === "--all" || mode === "--staged" || mode === "--changed-files" ? drizzleJournalErrors() : [];
  const files = filesForArgs(argv);
  const results = files.map((file) => {
    const sql = readFileForClassification(file);
    return classifySql(sql, {
      relativePath: file.relativePath ?? path.relative(repoRoot, file.filePath),
      source: file.source,
    });
  });
  const failed = journalErrors.length > 0 || results.some((result) => shouldFail(result, { baseline, allowRisky, allowContract }));
  const payload = {
    mode,
    baseline,
    checkedFiles: results.length,
    journalErrors,
    results,
    failed,
  };
  if (json) {
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  } else {
    for (const error of journalErrors) {
      process.stderr.write(`${process.env.GITHUB_ACTIONS ? "::error::" : ""}${error}\n`);
    }
    for (const result of results) {
      process.stdout.write(`[migration-safety] ${result.relativePath}: ${result.classification}\n`);
      for (const finding of result.findings) {
        const effectiveSeverity = baseline && finding.severity === "error" ? "warning" : finding.severity;
        const level = effectiveSeverity === "error" ? "error" : effectiveSeverity === "warning" ? "warning" : "notice";
        const gha = process.env.GITHUB_ACTIONS ? `::${level} file=${result.relativePath},line=${finding.line}::` : "";
        const stream = effectiveSeverity === "error" ? process.stderr : process.stdout;
        stream.write(`${gha}${effectiveSeverity.toUpperCase()} ${finding.rule}: ${finding.message} (line ${finding.line})\n`);
      }
    }
  }
  return failed ? 1 : 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    process.exitCode = runCli();
  } catch (error) {
    process.stderr.write(`[migration-safety] ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 2;
  }
}
