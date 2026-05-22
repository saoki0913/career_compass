#!/usr/bin/env node
import fs from "node:fs";
import { setDefaultResultOrder } from "node:dns";
import path from "node:path";
import process from "node:process";
import postgres from "postgres";
import { readMigrationFiles } from "drizzle-orm/migrator";
import {
  DRIZZLE_MIGRATION_DIR,
  SUPABASE_MIGRATION_DIR,
  detectDrizzleMetaSchema,
  listSqlFiles,
  readAppliedDrizzleMigrations,
  readAppliedSupabaseMigrationVersions,
  readDrizzleMigrationEntries,
  repoPath,
  repoRoot,
  supabaseVersionFromPath,
} from "../ci/migration-config.mjs";
import { classifySql } from "../ci/check-migration-safety.mjs";

function parseArgs(argv) {
  const args = {
    env: "local",
    dryRun: false,
    allowRisky: false,
    allowContract: false,
    json: false,
  };
  for (let idx = 0; idx < argv.length; idx += 1) {
    const arg = argv[idx];
    if (arg === "--env") {
      args.env = argv[idx + 1];
      idx += 1;
    } else if (arg === "--dry-run") {
      args.dryRun = true;
    } else if (arg === "--allow-risky") {
      args.allowRisky = true;
    } else if (arg === "--allow-contract") {
      args.allowContract = true;
    } else if (arg === "--json") {
      args.json = true;
    } else if (arg === "-h" || arg === "--help") {
      args.help = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (!["local", "staging", "production"].includes(args.env)) {
    throw new Error("--env must be local, staging, or production");
  }
  return args;
}

function loadEnvFile(envName) {
  const fileName =
    envName === "production" ? ".env.production" : envName === "staging" ? ".env.staging" : ".env.local";
  const filePath = repoPath(fileName);
  if (!fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const key = trimmed.slice(0, trimmed.indexOf("=")).trim();
    let value = trimmed.slice(trimmed.indexOf("=") + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

function redactUrl(url) {
  try {
    const parsed = new URL(url);
    parsed.username = parsed.username ? "[REDACTED]" : "";
    parsed.password = parsed.password ? "[REDACTED]" : "";
    return parsed.toString();
  } catch {
    return "[invalid-url]";
  }
}

function getDirectUrl() {
  const directUrl = process.env.DIRECT_URL?.trim();
  if (!directUrl) throw new Error("DIRECT_URL is required for migration runner.");
  let parsed;
  try {
    parsed = new URL(directUrl);
  } catch {
    throw new Error("DIRECT_URL is not a valid URL.");
  }
  if (parsed.port === "6543") {
    throw new Error(
      "Transaction Pooler (port 6543) では session-level advisory lock が保持できません。DIRECT_URL に Direct 接続 (port 5432) を設定してください。",
    );
  }
  return directUrl;
}

function compareDrizzleHistory(applied, localEntries) {
  const localByCreatedAt = new Map(localEntries.map((entry) => [Number(entry.when), entry]));
  const appliedByCreatedAt = new Map(applied.map((entry) => [Number(entry.createdAt), entry]));
  const errors = [];
  for (const row of applied) {
    const local = localByCreatedAt.get(row.createdAt);
    if (!local) {
      errors.push(`DB migration created_at=${row.createdAt} is not present in local journal.`);
      continue;
    }
    if (local.hash !== row.hash) {
      errors.push(`Migration hash mismatch for ${local.tag} (${row.createdAt}).`);
    }
  }
  const maxAppliedCreatedAt = applied.reduce((max, row) => Math.max(max, row.createdAt), 0);
  const pending = localEntries.filter((entry) => !appliedByCreatedAt.has(Number(entry.when)));
  const missingMiddle = pending.filter((entry) => Number(entry.when) <= maxAppliedCreatedAt);
  for (const entry of missingMiddle) {
    errors.push(`Migration ${entry.tag} is missing in DB but has created_at <= latest applied migration.`);
  }
  return { errors, pending };
}

function classifyPending(entries) {
  return entries.map((entry) => {
    const result = classifySql(entry.sql, {
      relativePath: entry.relativePath,
      source: "drizzle",
    });
    return { tag: entry.tag, idx: entry.idx, when: entry.when, ...result };
  });
}

export function migrationRequiresNonTransactionalApply(sqlStatements) {
  return sqlStatements.some((statement) => /\bCREATE\s+(?:UNIQUE\s+)?INDEX\s+CONCURRENTLY\b/i.test(statement));
}

export function splitPostgresStatements(sqlStatements) {
  const statements = [];
  for (const sqlText of sqlStatements) {
    let current = "";
    let singleQuoted = false;
    let doubleQuoted = false;
    let lineComment = false;
    let blockComment = false;
    let dollarQuoteTag = null;

    for (let idx = 0; idx < sqlText.length; idx += 1) {
      const char = sqlText[idx];
      const next = sqlText[idx + 1];

      if (lineComment) {
        current += char;
        if (char === "\n") lineComment = false;
        continue;
      }

      if (blockComment) {
        current += char;
        if (char === "*" && next === "/") {
          current += next;
          idx += 1;
          blockComment = false;
        }
        continue;
      }

      if (dollarQuoteTag) {
        if (sqlText.startsWith(dollarQuoteTag, idx)) {
          current += dollarQuoteTag;
          idx += dollarQuoteTag.length - 1;
          dollarQuoteTag = null;
        } else {
          current += char;
        }
        continue;
      }

      if (singleQuoted) {
        current += char;
        if (char === "'" && next === "'") {
          current += next;
          idx += 1;
        } else if (char === "'") {
          singleQuoted = false;
        }
        continue;
      }

      if (doubleQuoted) {
        current += char;
        if (char === '"' && next === '"') {
          current += next;
          idx += 1;
        } else if (char === '"') {
          doubleQuoted = false;
        }
        continue;
      }

      if (char === "-" && next === "-") {
        current += char + next;
        idx += 1;
        lineComment = true;
        continue;
      }

      if (char === "/" && next === "*") {
        current += char + next;
        idx += 1;
        blockComment = true;
        continue;
      }

      if (char === "'") {
        current += char;
        singleQuoted = true;
        continue;
      }

      if (char === '"') {
        current += char;
        doubleQuoted = true;
        continue;
      }

      if (char === "$") {
        const match = sqlText.slice(idx).match(/^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/);
        if (match) {
          dollarQuoteTag = match[0];
          current += dollarQuoteTag;
          idx += dollarQuoteTag.length - 1;
          continue;
        }
      }

      if (char === ";") {
        const statement = current.trim();
        if (statement) statements.push(statement);
        current = "";
        continue;
      }

      current += char;
    }

    const statement = current.trim();
    if (statement) statements.push(statement);
  }
  return statements;
}

function quotePgIdentifier(identifier) {
  return `"${String(identifier).replaceAll('"', '""')}"`;
}

async function ensureDrizzleMigrationTable(sql, detectedMetaSchema) {
  const schema = detectedMetaSchema ?? "drizzle";
  await sql.unsafe(`CREATE SCHEMA IF NOT EXISTS ${quotePgIdentifier(schema)}`);
  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS ${quotePgIdentifier(schema)}.${quotePgIdentifier("__drizzle_migrations")} (
      id SERIAL PRIMARY KEY,
      hash text NOT NULL,
      created_at bigint
    )
  `);
  return schema;
}

async function recordDrizzleMigration(sql, schema, migration) {
  await sql.unsafe(
    `INSERT INTO ${quotePgIdentifier(schema)}.${quotePgIdentifier("__drizzle_migrations")} ("hash", "created_at") VALUES ($1, $2)`,
    [migration.hash, migration.folderMillis],
  );
}

async function applyDrizzleMigration(sql, schema, migration, entry) {
  const statements = splitPostgresStatements(migration.sql);

  if (migrationRequiresNonTransactionalApply(statements)) {
    for (const statement of statements) {
      if (statement.trim()) {
        await sql.unsafe(statement);
      }
    }
    await recordDrizzleMigration(sql, schema, migration);
    return { tag: entry.tag, mode: "non_transactional" };
  }

  await sql.begin(async (tx) => {
    for (const statement of statements) {
      if (statement.trim()) {
        await tx.unsafe(statement);
      }
    }
    await recordDrizzleMigration(tx, schema, migration);
  });
  return { tag: entry.tag, mode: "transactional" };
}

async function applyPendingDrizzleMigrations(sql, history, detectedMetaSchema) {
  const schema = await ensureDrizzleMigrationTable(sql, detectedMetaSchema);
  const migrationFiles = readMigrationFiles({ migrationsFolder: repoPath(DRIZZLE_MIGRATION_DIR) });
  const migrationsByCreatedAt = new Map(migrationFiles.map((migration) => [Number(migration.folderMillis), migration]));
  const applied = [];

  for (const entry of history.pending) {
    const migration = migrationsByCreatedAt.get(Number(entry.when));
    if (!migration) {
      throw new Error(`Migration file metadata not found for ${entry.tag}.`);
    }
    applied.push(await applyDrizzleMigration(sql, schema, migration, entry));
  }

  return applied;
}

function blockerFromClassifications(classifications, args) {
  const blockers = [];
  for (const item of classifications) {
    const contract = item.findings.filter((finding) => finding.classification === "manual-contract");
    const risky = item.findings.filter((finding) => finding.classification === "manual-risky");
    if (contract.length > 0 && !args.allowContract) {
      blockers.push({ tag: item.tag, type: "manual-contract", findings: contract });
    }
    if (risky.length > 0 && !args.allowRisky) {
      blockers.push({ tag: item.tag, type: "manual-risky", findings: risky });
    }
  }
  return blockers;
}

async function readSupabasePending(sql) {
  const files = listSqlFiles(SUPABASE_MIGRATION_DIR);
  const localVersions = files
    .map((filePath) => ({ filePath, version: supabaseVersionFromPath(filePath) }))
    .filter((entry) => entry.version);
  const applied = await readAppliedSupabaseMigrationVersions(sql);
  if (applied === null) {
    return {
      checked: true,
      pending: localVersions,
      appliedCount: 0,
      localCount: localVersions.length,
      reason: "supabase_migrations.schema_migrations not found",
    };
  }
  const appliedSet = new Set(applied);
  return {
    checked: true,
    pending: localVersions.filter((entry) => !appliedSet.has(entry.version)),
    appliedCount: applied.length,
    localCount: localVersions.length,
    reason: null,
  };
}

function manualSupabaseInstructions(pending) {
  const versions = pending.pending.map((entry) => `${entry.version} (${path.relative(repoRoot, entry.filePath)})`);
  return [
    "Supabase CLI migration に未適用があります。release runner での自動適用は行いません。",
    "行うべき作業:",
    "1. docs/operations/production/DB_MIGRATION.md Phase 3 の Supabase CLI マイグレーション手順を確認する。",
    "2. 対象 SQL をレビューし、manual-risky / manual-contract の影響を確認する。",
    "3. Supabase CLI の dry-run または migration list で remote 履歴を確認する。",
    "4. 承認後に手動で Supabase migration を適用し、再度 deploy を実行する。",
    `未適用: ${versions.join(", ")}`,
  ].join("\n");
}

async function main(argv = process.argv.slice(2)) {
  setDefaultResultOrder("ipv4first");
  const args = parseArgs(argv);
  if (args.help) {
    process.stdout.write("Usage: run-migrations.mjs [--env local|staging|production] [--dry-run] [--allow-risky] [--allow-contract] [--json]\n");
    return 0;
  }

  if (!process.env.DIRECT_URL) loadEnvFile(args.env);
  const directUrl = getDirectUrl();
  const sql = postgres(directUrl, { max: 1, ssl: "require" });
  const payload = {
    env: args.env,
    dryRun: args.dryRun,
    database: redactUrl(directUrl),
    pending: 0,
    pendingTags: [],
    supabasePending: 0,
    blockers: [],
    applied: false,
    appliedMigrations: [],
  };

  try {
    const lockedRows = await sql`SELECT pg_try_advisory_lock(hashtext('career_compass_migration')) AS locked`;
    if (!lockedRows[0]?.locked) throw new Error("Another migration is already in progress.");

    const localEntries = readDrizzleMigrationEntries();
    const metaSchema = await detectDrizzleMetaSchema(sql);
    const applied = await readAppliedDrizzleMigrations(sql, metaSchema);
    const history = compareDrizzleHistory(applied, localEntries);
    if (history.errors.length > 0) {
      payload.historyErrors = history.errors;
      if (args.json) {
        payload.exitCode = 1;
        process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
        return 1;
      }
      throw new Error(`Migration history divergence detected:\n${history.errors.join("\n")}`);
    }

    const supabasePending = await readSupabasePending(sql);
    payload.supabasePending = supabasePending.pending.length;
    payload.supabase = {
      appliedCount: supabasePending.appliedCount,
      localCount: supabasePending.localCount,
      reason: supabasePending.reason,
      pendingVersions: supabasePending.pending.map((entry) => entry.version),
    };
    if (supabasePending.pending.length > 0 && args.env === "production") {
      if (args.json) {
        payload.exitCode = 1;
        process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
        return 1;
      }
      throw new Error(manualSupabaseInstructions(supabasePending));
    }

    const classifications = classifyPending(history.pending);
    const blockers = blockerFromClassifications(classifications, args);
    payload.pending = history.pending.length;
    payload.pendingTags = history.pending.map((entry) => entry.tag);
    payload.classifications = classifications.map((item) => ({
      tag: item.tag,
      classification: item.classification,
      findings: item.findings,
    }));
    payload.blockers = blockers;
    if (blockers.length > 0) {
      if (args.json) {
        payload.exitCode = 1;
        process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
        return 1;
      }
      throw new Error(`Pending migrations require manual approval: ${blockers.map((item) => `${item.tag}:${item.type}`).join(", ")}`);
    }

    if (history.pending.length > 0 && !args.dryRun) {
      payload.appliedMigrations = await applyPendingDrizzleMigrations(sql, history, metaSchema);
      const nextSchema = await detectDrizzleMetaSchema(sql);
      const nextApplied = await readAppliedDrizzleMigrations(sql, nextSchema);
      const nextHistory = compareDrizzleHistory(nextApplied, localEntries);
      if (nextHistory.errors.length > 0 || nextHistory.pending.length > 0) {
        throw new Error("Migration post-apply verification failed.");
      }
      payload.applied = true;
    }

    if (args.json) process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
    else process.stdout.write(`[run-migrations] pending=${payload.pending} supabasePending=${payload.supabasePending} applied=${payload.applied}\n`);
    return 0;
  } finally {
    try {
      await sql`SELECT pg_advisory_unlock(hashtext('career_compass_migration'))`;
    } catch {
      /* ignore unlock errors during connection shutdown */
    }
    await sql.end({ timeout: 5 });
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().then(
    (code) => {
      process.exitCode = code;
    },
    (error) => {
      process.stderr.write(`[run-migrations] ${error instanceof Error ? error.message : String(error)}\n`);
      process.exitCode = 1;
    },
  );
}
