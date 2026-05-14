import { describe, expect, it } from "vitest";

describe("DashboardSkeleton", () => {
  it("uses two-column layout matching DashboardShell", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile(new URL("./DashboardSkeleton.tsx", import.meta.url), "utf8");
    expect(source).toContain("lg:grid-cols-[minmax(0,3fr)_minmax(280px,1fr)]");
    expect(source).toContain("lg:h-dvh");
  });

  it("has responsive quick action skeleton pills in the greeting header", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile(new URL("./DashboardSkeleton.tsx", import.meta.url), "utf8");
    expect(source).toContain("ml-auto");
    expect(source).toContain("length: 5");
    expect(source).toContain("h-9");
    expect(source).toContain("w-[calc(100%+2rem)]");
    expect(source).toContain("flex-wrap");
    expect(source).toContain("xl:flex-nowrap");
    expect(source).toContain("lg:min-w-0");
    expect(source).toContain("2xl:block");
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
