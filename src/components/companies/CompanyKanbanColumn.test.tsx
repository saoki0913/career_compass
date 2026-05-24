import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";

describe("CompanyKanbanColumn", () => {
  it("is wrapped with React.memo for drag performance", async () => {
    const source = await readFile(new URL("./CompanyKanbanColumn.tsx", import.meta.url), "utf8");
    expect(source).toContain("memo(");
    expect(source).toMatch(/export\s+const\s+CompanyKanbanColumn\s*=\s*memo\(/);
  });

  it("uses useDroppable from dnd-kit", async () => {
    const source = await readFile(new URL("./CompanyKanbanColumn.tsx", import.meta.url), "utf8");
    expect(source).toContain("useDroppable");
    expect(source).toContain("setNodeRef");
  });

  it("supports collapsible card list via isCollapsed state", async () => {
    const source = await readFile(new URL("./CompanyKanbanColumn.tsx", import.meta.url), "utf8");
    expect(source).toContain("isCollapsed");
    expect(source).toContain("setIsCollapsed");
    expect(source).toContain("ChevronUp");
    expect(source).toContain("ChevronDown");
    expect(source).toContain("cursor-pointer");
  });
});
