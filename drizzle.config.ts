import type { Config } from "drizzle-kit";

export default {
  schema: "./src/lib/db/schema.ts",
  // Use a new out dir to avoid mixing old Turso/SQLite migrations with Postgres.
  out: "./drizzle_pg",
  dialect: "postgresql",
  dbCredentials: {
    // Prefer DIRECT_URL (5432) for migrations; fall back to DATABASE_URL (pooler) if needed.
    url: process.env.DIRECT_URL || process.env.DATABASE_URL!,
  },
} satisfies Config;
