#!/usr/bin/env node
/**
 * migration-coherence-check.mjs
 * Checks for schema changes without corresponding migrations.
 * Items: DB-01, DB-02
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

function run() {
  const findings = [];
  const files = getStagedFiles();

  const hasSchemaChange = files.some(f => f === "src/lib/db/schema.ts");
  const hasMigration = files.some(f => f.startsWith("drizzle_pg/"));
  const migrationFiles = files.filter(f => f.startsWith("drizzle_pg/"));

  // DB-01: schema changed without migration
  if (hasSchemaChange && !hasMigration) {
    // Inspect what kind of schema change it is
    const schemaContent = getStagedContent("src/lib/db/schema.ts");
    const schemaDiff = spawnSync(
      "git",
      ["-C", PROJECT_DIR, "diff", "--cached", "--", "src/lib/db/schema.ts"],
      { encoding: "utf8" },
    );
    const diff = schemaDiff.status === 0 ? schemaDiff.stdout : "";

    // Check if the change is structural (table/column add/remove) vs cosmetic (comments/types)
    const isStructuralChange = /^[+].*(?:pgTable|\.(?:text|integer|boolean|timestamp|varchar|uuid|jsonb|serial|bigint|real|numeric|decimal|smallint|bigserial|primaryKey|unique|index|references|notNull|default))\s*\(/m.test(diff);

    if (isStructuralChange) {
      findings.push({
        item_id: "DB-01",
        severity: "high",
        file: "src/lib/db/schema.ts",
        message: "schema.ts に構造的な変更がありますが対応するマイグレーション (drizzle_pg/) がステージされていません。npm run db:generate を実行してください",
      });
    } else {
      findings.push({
        item_id: "DB-01",
        severity: "low",
        file: "src/lib/db/schema.ts",
        message: "schema.ts が変更されていますが対応するマイグレーションがありません。構造変更でない場合は無視可",
      });
    }
  }

  // DB-02: migration without schema change (orphan migration)
  if (!hasSchemaChange && hasMigration) {
    for (const mf of migrationFiles) {
      // SQL migration files only
      if (mf.endsWith(".sql")) {
        findings.push({
          item_id: "DB-02",
          severity: "medium",
          file: mf,
          message: "マイグレーションファイルがステージされていますが schema.ts の変更がありません。手動マイグレーションか確認してください",
        });
      }
    }
  }

  print(findings);
}

try {
  run();
} catch {
  print([]);
}
