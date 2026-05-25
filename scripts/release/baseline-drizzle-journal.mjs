#!/usr/bin/env node
/**
 * baseline-drizzle-journal.mjs
 *
 * 新規環境 (staging / DR / CI 一時 DB) を本番パリティでブートストラップするための
 * journal baseline ツール。
 *
 * 用途:
 *   1. 空 DB に対し `drizzle-kit push` で現行スキーマを直接同期する (jsonb 列が最初から
 *      jsonb で作られ、0018/0026 の text→jsonb 変換 replay バグを回避する)。
 *   2. 本スクリプトで `__drizzle_migrations` に全 migration を「適用済み」として記録し、
 *      本番と同一の tracking 状態にする。これにより `run-migrations.mjs` の
 *      `compareDrizzleHistory` が pending: 0 かつ hash error なしで通る。
 *
 * これは本番のブートストラップ手法 (先にスキーマ構築 → migration 記録) の再現であり、
 * SQL migration の本文は一切実行しない。記録するのは drizzle が参照する
 * `(hash, created_at)` の行のみ。
 *
 * `readMigrationFiles` (drizzle-orm/migrator) が返す `migration.hash` は
 * `migration-config.mjs` の `readDrizzleMigrationEntries()` が使う `sha256Text` と
 * 同一アルゴリズム・同一入力 (SQL ファイル全文) のため、両者は完全一致する。
 * `folderMillis` は journal の `when` と一致する。よって baseline 後の
 * `compareDrizzleHistory(applied, localEntries)` は errors=[] / pending=[] になる。
 *
 * 安全策:
 *   - production への baseline は誤用防止のため弾く。本番 journal は既に正しいため
 *     baseline 不要であり、誤実行は __drizzle_migrations を二重記録で汚染しうる。
 *     どうしても必要な DR 復旧などでは `--allow-production` を明示する。
 *   - 既に記録済み (同一 created_at が存在) のものはスキップする (冪等)。
 *   - DIRECT_URL の port 6543 (Transaction Pooler) は拒否する。
 */
import fs from "node:fs";
import { setDefaultResultOrder } from "node:dns";
import process from "node:process";
import postgres from "postgres";
import { readMigrationFiles } from "drizzle-orm/migrator";
import {
  DRIZZLE_MIGRATION_DIR,
  detectDrizzleMetaSchema,
  readAppliedDrizzleMigrations,
  readDrizzleMigrationEntries,
  repoPath,
} from "../ci/migration-config.mjs";

function parseArgs(argv) {
  const args = {
    env: "staging",
    dryRun: false,
    json: false,
    allowProduction: false,
  };
  for (let idx = 0; idx < argv.length; idx += 1) {
    const arg = argv[idx];
    if (arg === "--env") {
      args.env = argv[idx + 1];
      idx += 1;
    } else if (arg === "--dry-run") {
      args.dryRun = true;
    } else if (arg === "--json") {
      args.json = true;
    } else if (arg === "--allow-production") {
      args.allowProduction = true;
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
  if (!directUrl) throw new Error("DIRECT_URL is required for journal baseline.");
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

function quotePgIdentifier(identifier) {
  return `"${String(identifier).replaceAll('"', '""')}"`;
}

/**
 * run-migrations.mjs の ensureDrizzleMigrationTable と同一スキーマ・同一 DDL。
 * 既に detectDrizzleMetaSchema が schema を返している場合はそれを使い、
 * 無い (null) 場合は drizzle スキーマに作る。
 */
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

/**
 * run-migrations.mjs の recordDrizzleMigration と同一 INSERT。
 * migration.hash / migration.folderMillis は readMigrationFiles 由来。
 */
async function recordDrizzleMigration(sql, schema, migration) {
  await sql.unsafe(
    `INSERT INTO ${quotePgIdentifier(schema)}.${quotePgIdentifier("__drizzle_migrations")} ("hash", "created_at") VALUES ($1, $2)`,
    [migration.hash, migration.folderMillis],
  );
}

async function main(argv = process.argv.slice(2)) {
  setDefaultResultOrder("ipv4first");
  const args = parseArgs(argv);
  if (args.help) {
    process.stdout.write(
      "Usage: baseline-drizzle-journal.mjs [--env staging|local|production] [--dry-run] [--json] [--allow-production]\n" +
        "\n" +
        "空 DB に drizzle-kit push でスキーマを構築した後、__drizzle_migrations に全 migration を\n" +
        "「適用済み」として記録し、本番と同一の tracking 状態にする (SQL は実行しない)。\n",
    );
    return 0;
  }

  if (args.env === "production" && !args.allowProduction) {
    throw new Error(
      "production への baseline は既定で禁止です。本番 journal は既に正しいため baseline 不要です。" +
        " DR 復旧などで本当に必要な場合のみ --allow-production を付けてください。",
    );
  }

  if (!process.env.DIRECT_URL) loadEnvFile(args.env);
  const directUrl = getDirectUrl();
  // local の Docker postgres は TLS 非対応 (プレーン接続)。staging/production の
  // Supabase cloud のみ TLS 必須。env=local で ssl:"require" を強制すると
  // "Client network socket disconnected before secure TLS connection" で落ちる。
  const sslMode = args.env === "local" ? false : "require";
  const sql = postgres(directUrl, { max: 1, ssl: sslMode });

  const payload = {
    command: "baseline-drizzle-journal",
    env: args.env,
    dryRun: args.dryRun,
    database: redactUrl(directUrl),
    totalMigrations: 0,
    alreadyRecorded: 0,
    recorded: 0,
    recordedTags: [],
    pending: null,
    historyErrors: null,
    verified: false,
  };

  try {
    const lockedRows = await sql`SELECT pg_try_advisory_lock(hashtext('career_compass_migration')) AS locked`;
    if (!lockedRows[0]?.locked) throw new Error("Another migration/baseline is already in progress.");

    // journal 由来 (= compareDrizzleHistory の比較対象) のローカル一覧。
    const localEntries = readDrizzleMigrationEntries();
    // 実 SQL ファイル由来。hash/folderMillis は localEntries と一致するが、
    // 記録は drizzle 標準の readMigrationFiles 出力を正本にする (本番と同じ経路)。
    const migrationFiles = readMigrationFiles({ migrationsFolder: repoPath(DRIZZLE_MIGRATION_DIR) });
    migrationFiles.sort((a, b) => Number(a.folderMillis) - Number(b.folderMillis));
    payload.totalMigrations = migrationFiles.length;

    const metaSchemaBefore = await detectDrizzleMetaSchema(sql);
    const appliedBefore = await readAppliedDrizzleMigrations(sql, metaSchemaBefore);
    const appliedByCreatedAt = new Set(appliedBefore.map((row) => Number(row.createdAt)));

    const toRecord = migrationFiles.filter((migration) => !appliedByCreatedAt.has(Number(migration.folderMillis)));
    payload.alreadyRecorded = migrationFiles.length - toRecord.length;

    if (args.dryRun) {
      // dry-run: 記録対象だけ算出し、書き込みは行わない。
      payload.recorded = 0;
      payload.recordedTags = toRecord.map((m) => {
        const entry = localEntries.find((e) => Number(e.when) === Number(m.folderMillis));
        return entry?.tag ?? String(m.folderMillis);
      });
      payload.pending = toRecord.length;
      emit(args, payload, `dry-run would record ${toRecord.length} migration(s)`);
      return 0;
    }

    const schema = await ensureDrizzleMigrationTable(sql, metaSchemaBefore);

    // 1 トランザクションで全件記録 (途中失敗時に部分記録を残さない)。
    await sql.begin(async (tx) => {
      for (const migration of toRecord) {
        await recordDrizzleMigration(tx, schema, migration);
      }
    });

    payload.recorded = toRecord.length;
    payload.recordedTags = toRecord.map((m) => {
      const entry = localEntries.find((e) => Number(e.when) === Number(m.folderMillis));
      return entry?.tag ?? String(m.folderMillis);
    });

    // 記録後の検証: run-migrations.mjs と同じ history 比較で pending:0 / errors:[] を確認する。
    const metaSchemaAfter = await detectDrizzleMetaSchema(sql);
    const appliedAfter = await readAppliedDrizzleMigrations(sql, metaSchemaAfter);
    const history = verifyHistory(appliedAfter, localEntries);
    payload.pending = history.pending.length;
    payload.historyErrors = history.errors;
    payload.verified = history.errors.length === 0 && history.pending.length === 0;

    if (!payload.verified) {
      payload.exitCode = 1;
      emit(args, payload, "baseline verification FAILED");
      return 1;
    }

    emit(args, payload, `recorded ${payload.recorded} migration(s); pending=0 verified`);
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

/**
 * run-migrations.mjs の compareDrizzleHistory と同等の検証ロジック。
 * baseline が runner の history 比較を pending:0 で通せることを自己確認する。
 */
function verifyHistory(applied, localEntries) {
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

function emit(args, payload, humanSummary) {
  if (args.json) {
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  } else {
    process.stdout.write(
      `[baseline-drizzle-journal] env=${payload.env} total=${payload.totalMigrations} ` +
        `alreadyRecorded=${payload.alreadyRecorded} recorded=${payload.recorded} ` +
        `verified=${payload.verified} :: ${humanSummary}\n`,
    );
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().then(
    (code) => {
      process.exitCode = code;
    },
    (error) => {
      process.stderr.write(`[baseline-drizzle-journal] ${error instanceof Error ? error.message : String(error)}\n`);
      process.exitCode = 1;
    },
  );
}

export { main, verifyHistory };
