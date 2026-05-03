import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";

describe("SidebarCredits", () => {
  it("exports SidebarCredits component", async () => {
    const mod = await import("./SidebarCredits");
    expect(mod.SidebarCredits).toBeDefined();
  });

  it("uses Radix Tooltip for hover label", async () => {
    const source = await readFile(new URL("./SidebarCredits.tsx", import.meta.url), "utf8");
    expect(source).toContain("TooltipProvider");
    expect(source).toContain("TooltipContent");
    expect(source).toContain("tooltipText");
  });
});
