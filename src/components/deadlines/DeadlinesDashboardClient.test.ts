import { describe, expect, it } from "vitest";

async function readSource() {
  const { readFile } = await import("node:fs/promises");
  return readFile(new URL("./DeadlinesDashboardClient.tsx", import.meta.url), "utf8");
}

describe("DeadlinesDashboardClient", () => {
  it("hides the description on mobile and shows it from sm up", async () => {
    const source = await readSource();
    expect(source).toContain("hidden");
    expect(source).toContain("sm:block");
    expect(source).toContain("未着手、進行中、期限切れを同じ画面で確認");
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

  it("keeps the sidebar-toggle clearance and status handlers", async () => {
    const source = await readSource();
    expect(source).toContain("pl-14");
    expect(source).toContain("lg:pl-0");
    expect(source).toContain("onClick={() => setStatusFilter(tab.key)}");
  });
});
