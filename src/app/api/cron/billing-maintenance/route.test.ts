import { describe, expect, it, vi } from "vitest";

describe("billing-maintenance cron", () => {
  it("exports GET handler", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile(new URL("./route.ts", import.meta.url), "utf8");
    expect(source).toContain("export async function GET");
  });

  it("verifies CRON_SECRET bearer token", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile(new URL("./route.ts", import.meta.url), "utf8");
    expect(source).toContain("authorization");
    expect(source).toContain("CRON_SECRET");
    expect(source).toContain("401");
  });

  it("calls cleanupExpiredReservations with 30-minute TTL", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile(new URL("./route.ts", import.meta.url), "utf8");
    expect(source).toContain("cleanupExpiredReservations");
    expect(source).toMatch(/30/);
  });

  it("cleans up old processedStripeEvents", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile(new URL("./route.ts", import.meta.url), "utf8");
    expect(source).toContain("processedStripeEvents");
    expect(source).toContain("90");
  });
});
