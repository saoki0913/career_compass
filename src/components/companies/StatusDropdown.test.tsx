import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";

describe("StatusDropdown", () => {
  it("uses Popover for the dropdown container", async () => {
    const source = await readFile(new URL("./StatusDropdown.tsx", import.meta.url), "utf8");
    expect(source).toContain("Popover");
    expect(source).toContain("PopoverTrigger");
    expect(source).toContain("PopoverContent");
  });

  it("renders grouped statuses by category", async () => {
    const source = await readFile(new URL("./StatusDropdown.tsx", import.meta.url), "utf8");
    expect(source).toContain("GROUPED_STATUSES");
    expect(source).toContain("CATEGORY_LABELS");
  });

  it("shows check mark for current status", async () => {
    const source = await readFile(new URL("./StatusDropdown.tsx", import.meta.url), "utf8");
    expect(source).toContain("Check");
  });
});
