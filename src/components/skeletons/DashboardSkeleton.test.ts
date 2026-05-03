import { describe, expect, it } from "vitest";

describe("DashboardSkeleton", () => {
  it("uses two-column layout matching DashboardPageClient", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile(new URL("./DashboardSkeleton.tsx", import.meta.url), "utf8");
    expect(source).toContain("lg:grid-cols-[minmax(0,3fr)_minmax(280px,1fr)]");
    expect(source).toContain("lg:h-dvh");
  });

  it("has inline QA skeleton pills in the greeting header", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile(new URL("./DashboardSkeleton.tsx", import.meta.url), "utf8");
    expect(source).toContain("ml-auto");
    expect(source).toContain("length: 5");
    expect(source).toContain("h-9");
  });

  it("right column includes task and deadline skeleton cards", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile(new URL("./DashboardSkeleton.tsx", import.meta.url), "utf8");
    expect(source).toContain("grid-rows-[minmax(0,1fr)_minmax(220px,0.72fr)]");
    expect(source).toContain("h-5 w-14");
  });

  it("uses Linear-style section divider skeletons for task card", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile(new URL("./DashboardSkeleton.tsx", import.meta.url), "utf8");
    expect(source).toContain("h-px flex-1 bg-border/30");
    expect(source).toContain('h-[18px] w-[18px]');
  });

  it("uses monochrome text skeletons for deadline card", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile(new URL("./DashboardSkeleton.tsx", import.meta.url), "utf8");
    expect(source).toContain("h-4 w-10");
  });
});
