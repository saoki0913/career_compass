import { describe, it, expect } from "vitest";

describe("TodayTasksCard", () => {
  it("exports TodayTasksCard component", async () => {
    const mod = await import("./TodayTasksCard");
    expect(mod.TodayTasksCard).toBeDefined();
  });

  it("uses compact padding and tight separator margin", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile(new URL("./TodayTasksCard.tsx", import.meta.url), "utf8");
    expect(source).toContain("p-2");
    expect(source).toContain("my-1.5");
    expect(source).not.toMatch(/\bmy-3\b/);
  });

  it("supports dashboard-controlled open task density", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile(new URL("./TodayTasksCard.tsx", import.meta.url), "utf8");
    expect(source).toContain("maxOpenTasks");
    expect(source).toContain("visibleOpenTasks");
  });
});
