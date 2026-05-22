import { describe, expect, it } from "vitest";

async function readSource() {
  const { readFile } = await import("node:fs/promises");
  return readFile(new URL("./ESListPageClient.tsx", import.meta.url), "utf8");
}

describe("ESListPageClient", () => {
  it("hides the description on mobile and shows it from sm up", async () => {
    const source = await readSource();
    expect(source).toContain("hidden text-muted-foreground sm:block");
  });

  it("clears the sidebar toggle by indenting the header on mobile", async () => {
    const source = await readSource();
    // 左上トグルと重ならないよう header をモバイルで右にずらす
    expect(source).toContain("pl-14");
    expect(source).toContain("lg:pl-0");
  });

  it("keeps the page title", async () => {
    const source = await readSource();
    expect(source).toContain("ES作成");
  });
});
