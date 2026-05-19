#!/usr/bin/env node
import fs from "node:fs";
import process from "node:process";
import postgres from "postgres";
import ts from "typescript";
import {
  detectDrizzleMetaSchema,
  readAppliedDrizzleMigrations,
  readDrizzleJournal,
  repoPath,
} from "./migration-config.mjs";

function loadEnvFile(fileName) {
  const filePath = repoPath(fileName);
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
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

export function extractPgTableNames(schemaSource) {
  const sourceFile = ts.createSourceFile("schema.ts", schemaSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const names = new Set();
  function visit(node) {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "pgTable" &&
      node.arguments.length > 0 &&
      ts.isStringLiteralLike(node.arguments[0])
    ) {
      names.add(node.arguments[0].text);
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return [...names].sort();
}

async function main(argv = process.argv.slice(2)) {
  const json = argv.includes("--json");
  const envArg = argv[argv.indexOf("--env") + 1];
  const envName = argv.includes("--env") ? envArg : "production";
  if (!["local", "staging", "production"].includes(envName)) {
    throw new Error("--env must be local, staging, or production.");
  }
  if (!process.env.DIRECT_URL && !process.env.DATABASE_URL) {
    loadEnvFile(envName === "local" ? ".env.local" : envName === "staging" ? ".env.staging" : ".env.production");
  }
  const url = process.env.DIRECT_URL?.trim() || process.env.DATABASE_URL?.trim();
  if (!url) throw new Error("DIRECT_URL or DATABASE_URL is required.");

  const sql = postgres(url, { max: 1, ssl: "require" });
  try {
    const expectedMigrations = readDrizzleJournal().entries.length;
    const metaSchema = await detectDrizzleMetaSchema(sql);
    const applied = await readAppliedDrizzleMigrations(sql, metaSchema);
    const schemaSource = fs.readFileSync(repoPath("src/lib/db/schema.ts"), "utf8");
    const expectedTables = extractPgTableNames(schemaSource);
    const tableRows = await sql`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
      ORDER BY table_name ASC
    `;
    const actualTables = tableRows.map((row) => row.table_name).sort();
    const actualSet = new Set(actualTables);
    const expectedSet = new Set(expectedTables);
    const missingTables = expectedTables.filter((name) => !actualSet.has(name));
    const extraTables = actualTables.filter((name) => !expectedSet.has(name));
    const payload = {
      env: envName,
      expectedMigrations,
      appliedMigrations: applied.length,
      metaSchema,
      missingTables,
      extraTables,
      expectedTables: expectedTables.length,
      actualTables: actualTables.length,
      ok: applied.length >= expectedMigrations && missingTables.length === 0,
    };
    if (json) process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
    else {
      process.stdout.write(`[schema-drift] migrations applied=${payload.appliedMigrations} expected=${expectedMigrations}\n`);
      process.stdout.write(`[schema-drift] missingTables=${missingTables.join(",") || "-"} extraTables=${extraTables.join(",") || "-"}\n`);
    }
    process.exitCode = payload.ok ? 0 : 1;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    process.stderr.write(`[schema-drift] ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 2;
  });
}
