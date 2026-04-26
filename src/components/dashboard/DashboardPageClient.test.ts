import { describe, it, expect } from "vitest";

describe("DashboardPageClient", () => {
  it("exports DashboardPageClient component", async () => {
    const mod = await import("./DashboardPageClient");
    expect(mod.DashboardPageClient).toBeDefined();
  });

  it("does not export removed StatsCard dependencies", async () => {
    const mod = await import("./DashboardPageClient") as Record<string, unknown>;
    expect(mod).not.toHaveProperty("StatsCard");
    expect(mod).not.toHaveProperty("computeDashboardStats");
  });

  it("does not import removed GoogleCalendarCard", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile(new URL("./DashboardPageClient.tsx", import.meta.url), "utf8");
    expect(source).not.toContain("GoogleCalendarCard");
  });
});
