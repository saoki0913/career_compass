import type { Config } from "drizzle-kit";

/**
 * Next.js は `DATABASE_URL` のみ使用（`src/lib/db/index.ts`）。
 * `DIRECT_URL` が別プロジェクト／ローカルを指していると、`db:migrate` だけが別 DB に当たりスキーマがズレる。
 * `DRIZZLE_MIGRATE_USE_DATABASE_URL=1` のときはアプリと同じ `DATABASE_URL` でマイグレーションする。
 */
const migrateUrl =
  process.env.DRIZZLE_MIGRATE_USE_DATABASE_URL === "1"
    ? process.env.DATABASE_URL
    : process.env.DIRECT_URL || process.env.DATABASE_URL;

export default {
  schema: "./src/lib/db/schema.ts",
  // Use a new out dir to avoid mixing old Turso/SQLite migrations with Postgres.
  out: "./drizzle_pg",
  dialect: "postgresql",
  dbCredentials: {
    url: migrateUrl!,
  },
} satisfies Config;
