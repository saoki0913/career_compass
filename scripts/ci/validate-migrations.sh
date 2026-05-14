#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$repo_root"

ci=0
if [[ "${1:-}" == "--ci" ]]; then
  ci=1
fi

emit_error() {
  if [[ "$ci" == "1" ]]; then
    printf '::error::%s\n' "$1" >&2
  else
    printf '[validate-migrations][error] %s\n' "$1" >&2
  fi
}

node <<'NODE'
const fs = require("node:fs");
const path = require("node:path");

const journalPath = path.join(process.cwd(), "drizzle_pg/meta/_journal.json");
const drizzleDir = path.join(process.cwd(), "drizzle_pg");
const supabaseDir = path.join(process.cwd(), "supabase/migrations");
const errors = [];

const journal = JSON.parse(fs.readFileSync(journalPath, "utf8"));
const entries = Array.isArray(journal.entries) ? journal.entries : [];
const tags = new Set(entries.map((entry) => entry.tag));

entries.forEach((entry, index) => {
  if (entry.idx !== index) errors.push(`Drizzle journal idx must be contiguous: expected ${index}, got ${entry.idx}`);
  const sqlPath = path.join(drizzleDir, `${entry.tag}.sql`);
  if (!fs.existsSync(sqlPath)) errors.push(`Missing Drizzle migration SQL: ${entry.tag}.sql`);
});

for (const file of fs.readdirSync(drizzleDir).filter((name) => name.endsWith(".sql"))) {
  const tag = file.replace(/\.sql$/, "");
  if (!tags.has(tag)) errors.push(`Drizzle SQL has no journal entry: ${file}`);
}

const supabaseFiles = fs.existsSync(supabaseDir)
  ? fs.readdirSync(supabaseDir).filter((name) => name.endsWith(".sql"))
  : [];
if (supabaseFiles.length === 0) errors.push("No Supabase migration SQL files found");

if (errors.length > 0) {
  for (const error of errors) process.stderr.write(`${error}\n`);
  process.exit(1);
}

process.stdout.write(`[validate-migrations] Drizzle journal entries: ${entries.length}\n`);
process.stdout.write(`[validate-migrations] Supabase migration files: ${supabaseFiles.length}\n`);
NODE

if ! node scripts/ci/check-migration-safety.mjs --all; then
  emit_error "Migration baseline safety audit failed."
  exit 1
fi

printf '[validate-migrations] OK\n'
