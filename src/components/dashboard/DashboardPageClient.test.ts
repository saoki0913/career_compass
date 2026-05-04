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

  it("renders one responsive QuickActions rail without clipping at intermediate desktop widths", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile(new URL("./DashboardPageClient.tsx", import.meta.url), "utf8");
    expect((source.match(/<QuickActions/g) ?? [])).toHaveLength(1);
    expect(source).toContain("flex-wrap");
    expect(source).toContain("xl:flex-nowrap");
    expect(source).toContain("lg:basis-full");
    expect(source).toContain("xl:ml-auto");
    expect(source).toContain("xl:min-w-0");
    expect(source).toContain("xl:flex-1");
    expect(source).toContain("xl:overflow-visible");
    expect(source).toContain("2xl:inline");
    expect(source).toContain("w-[calc(100%+2rem)]");
    expect(source).toContain("weekOffset");
  });

  it("constrains desktop dashboard to one viewport", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile(new URL("./DashboardPageClient.tsx", import.meta.url), "utf8");
    expect(source).toContain("lg:h-dvh");
    expect(source).toContain("lg:overflow-hidden");
    expect(source).toContain("maxOpenTasks");
  });

  it("renders standalone DeadlineCard below TodayTasksCard", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile(new URL("./DashboardPageClient.tsx", import.meta.url), "utf8");
    expect(source).toContain("DeadlineCard");
    expect(source).toContain("maxVisible={4}");
  });

  it("keeps deadlines out of TodayTasksCard", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile(new URL("./DashboardPageClient.tsx", import.meta.url), "utf8");
    expect(source).not.toContain("TodayTasksCard todayTask={todayTask} openTasks={openTasks} deadlines=");
    expect(source).toContain("<DeadlineCard deadlines={deadlines}");
  });

  it("right column splits today tasks and deadlines", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile(new URL("./DashboardPageClient.tsx", import.meta.url), "utf8");
    expect(source).toContain("grid-rows-[minmax(0,1fr)_minmax(220px,0.72fr)]");
  });

  it("passes task completion handler to task card", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile(new URL("./DashboardPageClient.tsx", import.meta.url), "utf8");
    expect(source).toContain("toggleComplete");
    expect(source).toContain("refreshOpenTasks");
    expect(source).toContain("handleCompleteTodayTask");
    expect(source).toContain("onCompleteTodayTask={handleCompleteTodayTask}");
    expect(source).toContain("onToggleTask={toggleComplete}");
  });

  it("uses entrance animations on card sections", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile(new URL("./DashboardPageClient.tsx", import.meta.url), "utf8");
    expect(source).toContain("animate-fade-up");
  });

  it("expands deadline lookahead when navigating future weeks", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile(new URL("./DashboardPageClient.tsx", import.meta.url), "utf8");
    expect(source).toContain("deadlineLookaheadDays");
    expect(source).toContain("7 + weekOffset * 7");
  });
});
