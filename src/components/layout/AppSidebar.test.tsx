import { describe, it, expect } from "vitest";

describe("AppSidebar", () => {
  it("exports SIDEBAR_WIDTH constants", async () => {
    const { SIDEBAR_WIDTH_EXPANDED, SIDEBAR_WIDTH_COLLAPSED } = await import("./AppSidebar");
    expect(SIDEBAR_WIDTH_EXPANDED).toBe(256);
    expect(SIDEBAR_WIDTH_COLLAPSED).toBe(48);
  });
});
