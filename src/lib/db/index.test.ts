import { describe, expect, it } from "vitest";

describe("db module", () => {
  it("exports db instance", async () => {
    const mod = await import("./index");
    expect(mod.db).toBeDefined();
  });

  it("types relational queries", async () => {
    const mod = await import("./index");

    const assertRelationsCompile = (database: typeof mod.db) => {
      void database.query.users.findFirst({ with: { companies: true } });
    };

    expect(assertRelationsCompile).toBeTypeOf("function");
  });
});
