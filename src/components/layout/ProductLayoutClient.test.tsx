import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";

describe("ProductLayoutClient", () => {
  it("exports ProductLayoutClient component", async () => {
    const source = await readFile(new URL("./ProductLayoutClient.tsx", import.meta.url), "utf8");
    expect(source).toContain("export function ProductLayoutClient");
  });

  it("accepts initialCollapsed prop in its signature", async () => {
    const source = await readFile(new URL("./ProductLayoutClient.tsx", import.meta.url), "utf8");
    expect(source).toContain("initialCollapsed");
  });

  it("passes initialCollapsed down to SidebarProvider", async () => {
    const source = await readFile(new URL("./ProductLayoutClient.tsx", import.meta.url), "utf8");
    // initialCollapsed must appear as a JSX attribute on SidebarProvider
    expect(source).toContain("SidebarProvider initialCollapsed={initialCollapsed}");
  });

  it("mobile sidebar toggle has 44px touch target (h-11 w-11)", async () => {
    const source = await readFile(new URL("./ProductLayoutClient.tsx", import.meta.url), "utf8");
    expect(source).toContain("h-11 w-11");
  });

  it("mobile sidebar toggle uses safe-area-inset-top for notch devices", async () => {
    const source = await readFile(new URL("./ProductLayoutClient.tsx", import.meta.url), "utf8");
    expect(source).toContain("env(safe-area-inset-top");
  });

  it("keeps the mobile sidebar toggle fixed on the left across product routes", async () => {
    const source = await readFile(new URL("./ProductLayoutClient.tsx", import.meta.url), "utf8");
    expect(source).toContain("left-3");
    expect(source).not.toContain('pathname === "/dashboard"');
    expect(source).not.toContain("right-5 sm:right-6");
  });

  it("uses initialCollapsed as a prop not a local variable", async () => {
    const source = await readFile(new URL("./ProductLayoutClient.tsx", import.meta.url), "utf8");
    // The prop must be destructured or referenced from function parameters, not computed locally
    expect(source).toMatch(/\{\s*children\s*,\s*initialCollapsed|\{\s*initialCollapsed\s*,\s*children/);
  });
});
