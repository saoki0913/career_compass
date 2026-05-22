import { describe, expect, it } from "vitest";

async function readSource() {
  const { readFile } = await import("node:fs/promises");
  return readFile(new URL("./DashboardShell.tsx", import.meta.url), "utf8");
}

describe("DashboardShell", () => {
  it("adds extra top padding on mobile so the sidebar toggle never overlaps the header", async () => {
    const source = await readSource();
    expect(source).toContain("pt-16");
    expect(source).toContain("sm:pt-14");
  });

  it("keeps the responsive two-column main grid", async () => {
    const source = await readSource();
    expect(source).toContain("grid-cols-1");
    expect(source).toContain("lg:grid-cols-[minmax(0,3fr)_minmax(280px,1fr)]");
  });
});
