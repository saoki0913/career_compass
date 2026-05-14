import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const DRIZZLE_MIGRATION_DIR = "drizzle_pg";
export const SUPABASE_MIGRATION_DIR = "supabase/migrations";
export const JOURNAL_PATH = "drizzle_pg/meta/_journal.json";

export const LARGE_TABLE_ESTIMATES = {
  documents: 500_000,
  companies: 100_000,
  notifications: 200_000,
  ai_messages: 1_000_000,
  users: 50_000,
};

export const DESTRUCTIVE_ANNOTATION_RE = /--\s*DESTRUCTIVE:\s*.+/i;
export const SAFE_ANNOTATION_RE = /--\s*SAFE:\s*.+/i;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const repoRoot = path.join(__dirname, "..", "..");

export function repoPath(...parts) {
  return path.join(repoRoot, ...parts);
}

export function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

export function sha256Text(text) {
  return crypto.createHash("sha256").update(text).digest("hex");
}

export function readDrizzleJournal() {
  const journal = readJson(repoPath(JOURNAL_PATH));
  const entries = Array.isArray(journal.entries) ? journal.entries : [];
  return { ...journal, entries };
}

export function drizzleSqlPathForEntry(entry) {
  return repoPath(DRIZZLE_MIGRATION_DIR, `${entry.tag}.sql`);
}

export function readDrizzleMigrationEntries() {
  return readDrizzleJournal().entries.map((entry) => {
    const filePath = drizzleSqlPathForEntry(entry);
    const sql = fs.readFileSync(filePath, "utf8");
    return {
      ...entry,
      filePath,
      relativePath: path.relative(repoRoot, filePath),
      hash: sha256Text(sql),
      sql,
    };
  });
}

export function listSqlFiles(relativeDir) {
  const dir = repoPath(relativeDir);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => path.join(dir, name));
}

export function supabaseVersionFromPath(filePath) {
  const base = path.basename(filePath, ".sql");
  const match = /^(\d{14})_/.exec(base);
  return match?.[1] ?? null;
}

export async function detectDrizzleMetaSchema(sql) {
  const rows = await sql`
    SELECT table_schema
    FROM information_schema.tables
    WHERE table_name = '__drizzle_migrations'
      AND table_schema IN ('drizzle', 'public')
    ORDER BY table_schema
  `;
  const schemas = rows.map((row) => row.table_schema);
  if (schemas.length === 0) return null;
  if (schemas.length > 1) {
    throw new Error(
      `Multiple __drizzle_migrations tables detected (${schemas.join(", ")}). Resolve migration history before deploy.`,
    );
  }
  return schemas[0];
}

export async function readAppliedDrizzleMigrations(sql, metaSchema) {
  if (!metaSchema) return [];
  const rows =
    metaSchema === "drizzle"
      ? await sql`SELECT id, hash, created_at FROM drizzle.__drizzle_migrations ORDER BY created_at ASC, id ASC`
      : await sql`SELECT id, hash, created_at FROM public.__drizzle_migrations ORDER BY created_at ASC, id ASC`;
  return rows.map((row) => ({
    id: Number(row.id),
    hash: String(row.hash),
    createdAt: Number(row.created_at),
  }));
}

export async function readAppliedSupabaseMigrationVersions(sql) {
  const tables = await sql`
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'supabase_migrations'
      AND table_name = 'schema_migrations'
    LIMIT 1
  `;
  if (tables.length === 0) return null;
  const rows = await sql`
    SELECT version
    FROM supabase_migrations.schema_migrations
    ORDER BY version ASC
  `;
  return rows.map((row) => String(row.version));
}
