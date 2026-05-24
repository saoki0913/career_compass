import { describe, expect, it } from "vitest";

async function readSource() {
  const { readFile } = await import("node:fs/promises");
  return readFile(new URL("./DeadlinesDashboardClient.tsx", import.meta.url), "utf8");
}

describe("DeadlinesDashboardClient", () => {
  it("uses the shared product page header for the title block", async () => {
    const source = await readSource();
    expect(source).toContain("ProductPageHeader");
    expect(source).toContain("選考の締切をまとめて管理できます");
    expect(source).not.toContain("text-3xl");
  });

  it("uses responsive shared filter controls", async () => {
    const source = await readSource();
    expect(source).toContain("ListPageFilterBar");
    expect(source).toContain('searchPlaceholder="締切を検索..."');
    expect(source).toContain('className="h-12 w-full rounded-xl lg:h-9 lg:w-[160px]"');
  });

  it("shrinks the status tabs on mobile", async () => {
    const source = await readSource();
    expect(source).toContain("filterTabs={deadlineFilterTabs}");
    expect(source).toContain("tabCounts={tabCounts}");
  });

  it("keeps the status handlers", async () => {
    const source = await readSource();
    expect(source).toContain("onFilterChange={(key) => setStatusFilter(key)}");
  });
});
