#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { DRIZZLE_MIGRATION_DIR, readDrizzleMigrationEntries, repoPath } from "../ci/migration-config.mjs";
import { stripSqlForScanning } from "../ci/check-migration-safety.mjs";

function rollbackForSql(sql) {
  const stripped = stripSqlForScanning(sql);
  const lines = [];
  const statements = stripped.split(/;|-->\s*statement-breakpoint/g).map((part) => part.trim()).filter(Boolean);
  for (const stmt of statements) {
    let match = /^CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?("?[\w.]+"?)/i.exec(stmt);
    if (match) {
      lines.push(`DROP TABLE IF EXISTS ${match[1]};`);
      continue;
    }
    match = /^ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?("?[\w.]+"?)\s+ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?("?[\w]+"?)/i.exec(stmt);
    if (match) {
      lines.push(`ALTER TABLE ${match[1]} DROP COLUMN IF EXISTS ${match[2]};`);
      continue;
    }
    match = /^CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:CONCURRENTLY\s+)?(?:IF\s+NOT\s+EXISTS\s+)?("?[\w]+"?)/i.exec(stmt);
    if (match) {
      lines.push(`DROP INDEX IF EXISTS ${match[1]};`);
      continue;
    }
    match = /^CREATE\s+TRIGGER\s+("?[\w]+"?)\s+[\s\S]*?\s+ON\s+("?[\w.]+"?)/i.exec(stmt);
    if (match) {
      lines.push(`DROP TRIGGER IF EXISTS ${match[1]} ON ${match[2]};`);
      continue;
    }
    match = /^CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+("?[\w.]+"?\([^)]*\)|"?[\w.]+"?)/i.exec(stmt);
    if (match) {
      lines.push(`DROP FUNCTION IF EXISTS ${match[1]};`);
      continue;
    }
    if (/^(DROP|DELETE|TRUNCATE|UPDATE|INSERT|ALTER\s+TABLE.+DROP|ALTER\s+TABLE.+TYPE|ALTER\s+TABLE.+RENAME)/i.test(stmt)) {
      lines.push(`-- MANUAL ROLLBACK REQUIRED: ${stmt.slice(0, 140).replace(/\s+/g, " ")}`);
    }
  }
  if (lines.length === 0) lines.push("-- MANUAL ROLLBACK REQUIRED: no reversible statements detected");
  return `${lines.join("\n")}\n`;
}

function parseArgs(argv) {
  const args = { all: false, outDir: repoPath(DRIZZLE_MIGRATION_DIR, "rollback") };
  for (let idx = 0; idx < argv.length; idx += 1) {
    if (argv[idx] === "--all") args.all = true;
    else if (argv[idx] === "--out-dir") {
      args.outDir = path.resolve(argv[idx + 1]);
      idx += 1;
    } else if (argv[idx] === "--help" || argv[idx] === "-h") {
      args.help = true;
    } else {
      throw new Error(`Unknown argument: ${argv[idx]}`);
    }
  }
  return args;
}

function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help) {
    process.stdout.write("Usage: generate-rollback.mjs --all [--out-dir <dir>]\n");
    return 0;
  }
  if (!args.all) throw new Error("--all is required");
  fs.mkdirSync(args.outDir, { recursive: true });
  const entries = readDrizzleMigrationEntries();
  for (const entry of entries) {
    const fileName = `${String(entry.idx).padStart(4, "0")}_rollback.sql`;
    fs.writeFileSync(path.join(args.outDir, fileName), rollbackForSql(entry.sql));
  }
  process.stdout.write(`[generate-rollback] generated=${entries.length} outDir=${args.outDir}\n`);
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    process.exitCode = main();
  } catch (error) {
    process.stderr.write(`[generate-rollback] ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
