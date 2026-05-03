import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";

describe("AppSidebar", () => {
  it("exports SIDEBAR_WIDTH constants", async () => {
    const { SIDEBAR_WIDTH_EXPANDED, SIDEBAR_WIDTH_COLLAPSED } = await import("./AppSidebar");
    expect(SIDEBAR_WIDTH_EXPANDED).toBe(256);
    expect(SIDEBAR_WIDTH_COLLAPSED).toBe(48);
  });

  it("separates link and modal navigation actions explicitly", async () => {
    const source = await readFile(new URL("./AppSidebar.tsx", import.meta.url), "utf8");
    expect(source).toContain('type: "link"');
    expect(source).toContain('type: "modal"');
    expect(source).not.toContain("isModal");
  });

  it("provides a sidebar motivation entry through the company select modal", async () => {
    const source = await readFile(new URL("./AppSidebar.tsx", import.meta.url), "utf8");
    expect(source).toContain("志望動機作成");
    expect(source).toContain('modal: "motivation"');
    expect(source).toContain('mode="motivation"');
  });

  it("keeps interview and motivation modal state independent", async () => {
    const source = await readFile(new URL("./AppSidebar.tsx", import.meta.url), "utf8");
    expect(source).toContain("showInterviewModal");
    expect(source).toContain("showMotivationModal");
    expect(source).toContain('modal === "interview"');
  });

  it("does not stretch collapsed modal navigation buttons", async () => {
    const source = await readFile(new URL("./AppSidebar.tsx", import.meta.url), "utf8");
    expect(source).toContain('isCol ? "h-9 w-9 justify-center mx-auto"');
    expect(source).toContain('!isCol && "w-full"');
  });

  it("provides aria-label on collapsed nav items for accessibility", async () => {
    const source = await readFile(new URL("./AppSidebar.tsx", import.meta.url), "utf8");
    expect(source).toContain('aria-label={isCol ? item.label : undefined}');
  });

  it("uses Radix Tooltip for nav item labels", async () => {
    const source = await readFile(new URL("./AppSidebar.tsx", import.meta.url), "utf8");
    expect(source).toContain("TooltipProvider");
    expect(source).toContain("TooltipTrigger");
    expect(source).toContain("TooltipContent");
    expect(source).toContain("{item.label}");
  });
});
