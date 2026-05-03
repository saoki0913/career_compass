import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";

describe("SidebarNotifications", () => {
  it("exports SidebarNotifications component", async () => {
    const mod = await import("./SidebarNotifications");
    expect(mod.SidebarNotifications).toBeDefined();
  });

  it("shows count badge in collapsed mode (not just a dot)", async () => {
    const source = await readFile(new URL("./SidebarNotifications.tsx", import.meta.url), "utf8");
    expect(source).not.toMatch(/h-2 w-2 rounded-full bg-destructive/);
    expect(source).toContain("unreadCount");
    expect(source).toContain("text-destructive-foreground");
  });

  it("uses Radix Tooltip for hover label", async () => {
    const source = await readFile(new URL("./SidebarNotifications.tsx", import.meta.url), "utf8");
    expect(source).toContain("TooltipProvider");
    expect(source).toContain("TooltipContent");
  });
});
