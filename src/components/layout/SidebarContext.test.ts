import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";

describe("SidebarContext", () => {
  it("exports SidebarProvider and useSidebar", async () => {
    const mod = await import("./SidebarContext");
    expect(mod.SidebarProvider).toBeDefined();
    expect(mod.useSidebar).toBeDefined();
  });

  it("accepts initialCollapsed prop in SidebarProvider", async () => {
    const source = await readFile(
      new URL("./SidebarContext.tsx", import.meta.url),
      "utf8",
    );
    expect(source).toContain("initialCollapsed");
  });

  it("defaults isCollapsed to false when no initialCollapsed prop", async () => {
    const source = await readFile(
      new URL("./SidebarContext.tsx", import.meta.url),
      "utf8",
    );
    // The prop should be optional
    expect(source).toMatch(/initialCollapsed\??\s*[:?]/);
    // useState falls back to false via nullish coalescing
    expect(source).toContain("useState(initialCollapsed ?? false)");
  });

  it("uses initialCollapsed as initial state value", async () => {
    const source = await readFile(
      new URL("./SidebarContext.tsx", import.meta.url),
      "utf8",
    );
    expect(source).toContain("useState(initialCollapsed");
  });

  it("sets sidebar-collapsed cookie with correct attributes", async () => {
    const source = await readFile(
      new URL("./SidebarContext.tsx", import.meta.url),
      "utf8",
    );
    expect(source).toContain("sidebar-collapsed=");
    expect(source).toContain("path=/");
    expect(source).toContain("max-age=31536000");
    expect(source).toContain("SameSite=Lax");
  });

  it("keeps localStorage writes for backward compatibility", async () => {
    const source = await readFile(
      new URL("./SidebarContext.tsx", import.meta.url),
      "utf8",
    );
    expect(source).toContain("localStorage.setItem(STORAGE_KEY");
  });

  it("does not read from localStorage via useEffect on mount", async () => {
    const source = await readFile(
      new URL("./SidebarContext.tsx", import.meta.url),
      "utf8",
    );
    // The old useEffect that reads localStorage should be removed
    expect(source).not.toContain("localStorage.getItem(STORAGE_KEY)");
  });

  it("does not import useEffect (no longer needed)", async () => {
    const source = await readFile(
      new URL("./SidebarContext.tsx", import.meta.url),
      "utf8",
    );
    expect(source).not.toContain("useEffect");
  });
});
