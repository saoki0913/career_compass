import { describe, expect, it } from "vitest";

describe("Dashboard streaming zones", () => {
  it("splits dashboard responsibilities into shell, header, and zones", async () => {
    const [shell, header, schedule, pipeline, tasks, deadlines] = await Promise.all([
      import("./DashboardShell"),
      import("./DashboardHeader"),
      import("./DashboardScheduleZone"),
      import("./DashboardPipelineZone"),
      import("./DashboardTasksZone"),
      import("./DashboardDeadlinesZone"),
    ]);

    expect(shell.DashboardShell).toBeDefined();
    expect(header.DashboardHeader).toBeDefined();
    expect(schedule.DashboardScheduleZone).toBeDefined();
    expect(pipeline.DashboardPipelineZone).toBeDefined();
    expect(tasks.DashboardTasksZone).toBeDefined();
    expect(deadlines.DashboardDeadlinesZone).toBeDefined();
  });

  it("keeps layout sizing and purchase handling in the correct components", async () => {
    const { readFile } = await import("node:fs/promises");
    const shell = await readFile(new URL("./DashboardShell.tsx", import.meta.url), "utf8");
    const header = await readFile(new URL("./DashboardHeader.tsx", import.meta.url), "utf8");

    expect(shell).toContain("useSidebar");
    expect(shell).toContain("max-w-[1440px]");
    expect(shell).toContain("lg:grid-cols-[minmax(0,3fr)_minmax(280px,1fr)]");
    expect(header).toContain("getPurchaseSuccessState");
    expect(header).toContain("notifyPurchaseSuccess");
    expect(header).toContain("CompanySelectModal");
  });

  it("keeps deadline lookahead inside the schedule zone and a standalone deadline card zone", async () => {
    const { readFile } = await import("node:fs/promises");
    const schedule = await readFile(new URL("./DashboardScheduleZone.tsx", import.meta.url), "utf8");
    const deadlines = await readFile(new URL("./DashboardDeadlinesZone.tsx", import.meta.url), "utf8");

    expect(schedule).toContain("deadlineLookaheadDays");
    expect(schedule).toContain("7 + weekOffset * 7");
    expect(deadlines).toContain("DeadlineCard");
    expect(deadlines).toContain("maxVisible={4}");
  });

  it("removes the monolithic DashboardPageClient file from the active design", async () => {
    const { access } = await import("node:fs/promises");
    await expect(access(new URL("./DashboardPageClient.tsx", import.meta.url))).rejects.toThrow();
  });
});
