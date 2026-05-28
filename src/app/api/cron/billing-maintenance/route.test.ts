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

  // Phase 8 observability contract.
  // The atomic persist+confirmInTx transaction (Phase 3-5) is the primary
  // mechanism for credit billing integrity; this cron is only the backstop
  // for orphan reservations from rare crash-between-reserve-and-commit cases.
  // If `canceledCount > 0` shows up here, it means the atomic mechanism let
  // something through — we want that to be visible as a structured warning,
  // not just a JSON response body buried in cron logs.
  it("emits a structured warning when orphan reservations were canceled", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile(new URL("./route.ts", import.meta.url), "utf8");
    expect(source).toContain("logWarn");
    expect(source).toContain("billing-maintenance.orphan-reservations");
  });

  it("emits a structured info log of the maintenance summary", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile(new URL("./route.ts", import.meta.url), "utf8");
    expect(source).toContain("logInfo");
    expect(source).toContain("billing-maintenance.completed");
  });
});

// Phase 8 cron registration contract.
// vercel.json is the single source of truth for which cron paths Vercel
// invokes; if the path is in route.ts but not in vercel.json, the cron
// never fires and orphan reservations accumulate silently.
describe("billing-maintenance vercel.json registration", () => {
  it("is registered as a daily cron in vercel.json", async () => {
    const { readFile } = await import("node:fs/promises");
    const { fileURLToPath } = await import("node:url");
    const { dirname, resolve } = await import("node:path");
    const here = dirname(fileURLToPath(import.meta.url));
    const vercelJsonPath = resolve(here, "../../../../../vercel.json");
    const raw = await readFile(vercelJsonPath, "utf8");
    const config = JSON.parse(raw);
    const entry = (config.crons ?? []).find(
      (cron: { path?: string }) => cron.path === "/api/cron/billing-maintenance",
    );
    expect(entry, "billing-maintenance cron must be registered in vercel.json").toBeDefined();
    // Vercel Hobby tier only allows daily crons (one `0` for minute + one
    // numeric or `*` for hour, never `*/n`); enforce the daily shape so a
    // future migration to sub-daily on Hobby fails loudly.
    expect(entry.schedule).toMatch(/^0 \d{1,2} \* \* \*$/);
  });
});
