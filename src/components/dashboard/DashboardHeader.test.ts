import { describe, expect, it } from "vitest";

async function readSource() {
  const { readFile } = await import("node:fs/promises");
  return readFile(new URL("./DashboardHeader.tsx", import.meta.url), "utf8");
}

describe("DashboardHeader", () => {
  it("clears the sidebar toggle by indenting the greeting on mobile", async () => {
    const source = await readSource();
    // 左上トグル（右端 ~56px）と重ならないよう greeting を pl-14、lg で解除
    expect(source).toContain("pl-14 lg:pl-0");
  });

  it("lets quick actions span full width on mobile without horizontal scroll", async () => {
    const source = await readSource();
    // 2列グリッド化に伴い負マージン横スクロールを廃止
    expect(source).toContain("w-full sm:w-full lg:basis-full");
    expect(source).not.toContain("-mx-5 w-[calc(100%+2.5rem)]");
  });

  it("keeps the interview and motivation handlers wired", async () => {
    const source = await readSource();
    expect(source).toContain("onInterviewClick");
    expect(source).toContain("onMotivationClick");
  });
});
