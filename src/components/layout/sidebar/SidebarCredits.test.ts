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

  it("imports getCreditLowThreshold for low-balance detection", async () => {
    const source = await readFile(new URL("./SidebarCredits.tsx", import.meta.url), "utf8");
    expect(source).toContain("getCreditLowThreshold");
  });

  it("applies destructive color when depleted", async () => {
    const source = await readFile(new URL("./SidebarCredits.tsx", import.meta.url), "utf8");
    expect(source).toContain("isDepleted");
    expect(source).toContain("text-destructive");
  });

  it("applies amber warning color when low", async () => {
    const source = await readFile(new URL("./SidebarCredits.tsx", import.meta.url), "utf8");
    expect(source).toContain("isLow");
    expect(source).toContain("text-amber-600");
  });

  it("displays plan label and monthly allocation", async () => {
    const source = await readFile(new URL("./SidebarCredits.tsx", import.meta.url), "utf8");
    expect(source).toContain("planLabel");
    expect(source).toContain("monthlyAllocation");
  });
});
