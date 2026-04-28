import { describe, it, expect } from "vitest";

describe("DeadlineCard", () => {
  it("exports DeadlineCard component", async () => {
    const mod = await import("./DeadlineCard");
    expect(mod.DeadlineCard).toBeDefined();
  });

  it("uses compact padding for sidebar layout", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile(new URL("./DeadlineCard.tsx", import.meta.url), "utf8");
    expect(source).toContain("py-1.5");
    expect(source).toContain("py-0.5");
  });

  it("supports dashboard-controlled deadline density", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile(new URL("./DeadlineCard.tsx", import.meta.url), "utf8");
    expect(source).toContain("maxVisible");
    expect(source).toContain("deadlines.slice(0, maxVisible)");
  });
});
