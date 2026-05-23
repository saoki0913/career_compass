import { describe, expect, it } from "vitest";

async function readSource() {
  const { readFile } = await import("node:fs/promises");
  return readFile(new URL("./DeadlinesDashboardClient.tsx", import.meta.url), "utf8");
}

describe("DeadlinesDashboardClient", () => {
  it("uses the shared product page header for the title block", async () => {
    const source = await readSource();
    expect(source).toContain("ProductPageHeader");
    expect(source).toContain("未着手、進行中、期限切れを同じ画面で確認");
    expect(source).not.toContain("text-3xl");
  });

  it("uses compact h-10 filter controls", async () => {
    const source = await readSource();
    // 検索・Select の controlClassName をモバイルから h-10 に
    expect(source).toContain("h-10 rounded-xl border-slate-200");
    expect(source).toContain("h-10 w-full rounded-xl border border-slate-200");
  });

  it("shrinks the status tabs on mobile", async () => {
    const source = await readSource();
    expect(source).toContain("sm:px-4 sm:text-sm");
    expect(source).toContain("text-[13px]");
  });

  it("keeps the status handlers", async () => {
    const source = await readSource();
    expect(source).toContain("onClick={() => setStatusFilter(tab.key)}");
  });
});
