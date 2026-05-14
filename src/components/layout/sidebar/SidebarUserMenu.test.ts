import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";

describe("SidebarUserMenu", () => {
  it("exports SidebarUserMenu component", async () => {
    const mod = await import("./SidebarUserMenu");
    expect(mod.SidebarUserMenu).toBeDefined();
  });

  it("uses Radix Tooltip for hover label", async () => {
    const source = await readFile(new URL("./SidebarUserMenu.tsx", import.meta.url), "utf8");
    expect(source).toContain("TooltipProvider");
    expect(source).toContain("TooltipContent");
    expect(source).toContain("displayName");
  });

  it("links profile and settings menu items to registered product routes", async () => {
    const source = await readFile(new URL("./SidebarUserMenu.tsx", import.meta.url), "utf8");
    expect(source).toContain("appPaths.product.profile");
    expect(source).toContain("appPaths.product.settings");
    expect(source).not.toContain('href="/settings/profile"');
  });
});
