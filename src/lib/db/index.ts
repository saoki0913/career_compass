import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { getDatabaseEnvStatus } from "@/env/capabilities";
import * as relations from "./relations";
import * as tables from "./schema";

const schema = { ...tables, ...relations };

declare const globalThis: typeof global & {
  __career_compass_postgres__?: ReturnType<typeof postgres>;
};

const databaseEnvStatus = getDatabaseEnvStatus();
const databaseUrl = databaseEnvStatus.configured ? databaseEnvStatus.env.DATABASE_URL : undefined;
const missingDatabaseMessage = databaseEnvStatus.configured
  ? undefined
  : `Database environment is not configured: ${[
      ...databaseEnvStatus.missing.map((key) => `${key} is missing`),
      ...databaseEnvStatus.invalid.map((key) => `${key} is invalid`),
    ].join(", ")}`;

function createMissingDb(message = "DATABASE_URL is not set"): PostgresJsDatabase<typeof schema> {
  // Avoid throwing at module-import time (e.g. during `next build`) so that
  // marketing pages can be built without DB creds. Any actual DB usage should
  // fail fast with a clear error.
  return new Proxy(
    {},
    {
      get(_target, prop) {
        // Prevent accidental Promise-like behavior.
        if (prop === "then") return undefined;
        return () => {
          throw new Error(message);
        };
      },
    }
  ) as unknown as PostgresJsDatabase<typeof schema>;
}

const db: PostgresJsDatabase<typeof schema> = (() => {
  if (!databaseEnvStatus.configured || !databaseUrl) return createMissingDb(missingDatabaseMessage);

  const shouldDisableSsl =
    databaseUrl.includes("localhost") || databaseUrl.includes("127.0.0.1");

  // Reuse the client across hot reloads in dev to avoid exhausting connections.
  const client =
    globalThis.__career_compass_postgres__ ??
    postgres(databaseUrl, {
      // Supabase pooler (transaction mode) doesn't support prepared statements.
      prepare: false,
      // Supabase requires TLS; local Postgres commonly doesn't.
      ssl: shouldDisableSsl ? false : "require",
      // Conservative default to avoid connection spikes in serverless.
      max: databaseEnvStatus.env.DATABASE_POOL_SIZE ?? (shouldDisableSsl ? 10 : 5),
      // Prevent stale connections across Vercel freeze/thaw cycles.
      idle_timeout: 20,
      connect_timeout: 10,
      max_lifetime: 60 * 30,
    });

  if (process.env.NODE_ENV !== "production") {
    globalThis.__career_compass_postgres__ = client;
  }

  return drizzle(client, { schema });
})();

export { db };
