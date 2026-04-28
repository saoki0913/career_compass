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

  it("uses dynamic max-width based on sidebar state", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile(new URL("./DashboardPageClient.tsx", import.meta.url), "utf8");
    expect(source).toContain("useSidebar");
    expect(source).toContain("max-w-[1440px]");
  });

  it("uses QuickActions inline in the greeting header row", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile(new URL("./DashboardPageClient.tsx", import.meta.url), "utf8");
    expect(source).toContain("inline");
    expect(source).toContain("weekOffset");
  });

  it("constrains desktop dashboard to one viewport", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile(new URL("./DashboardPageClient.tsx", import.meta.url), "utf8");
    expect(source).toContain("lg:h-dvh");
    expect(source).toContain("lg:overflow-hidden");
    expect(source).toContain("maxOpenTasks");
    expect(source).toContain("maxVisible");
  });

  it("expands deadline lookahead when navigating future weeks", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile(new URL("./DashboardPageClient.tsx", import.meta.url), "utf8");
    expect(source).toContain("deadlineLookaheadDays");
    expect(source).toContain("7 + weekOffset * 7");
  });
});
