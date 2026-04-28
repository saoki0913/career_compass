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
  });
});
