import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

declare const globalThis: typeof global & {
  __career_compass_postgres__?: ReturnType<typeof postgres>;
};

const databaseUrl = process.env.DATABASE_URL;

function createMissingDb(): PostgresJsDatabase<typeof schema> {
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
          throw new Error("DATABASE_URL is not set");
        };
      },
    }
  ) as unknown as PostgresJsDatabase<typeof schema>;
}

const db: PostgresJsDatabase<typeof schema> = (() => {
  if (!databaseUrl) return createMissingDb();

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
      max: 5,
    });

  if (process.env.NODE_ENV !== "production") {
    globalThis.__career_compass_postgres__ = client;
  }

  return drizzle(client, { schema });
})();

export { db };
