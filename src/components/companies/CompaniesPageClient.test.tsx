import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";

describe("CompaniesPageClient", () => {
  it("uses the kanban board as the default view while keeping grid mode", async () => {
    const source = await readFile(new URL("./CompaniesPageClient.tsx", import.meta.url), "utf8");
    expect(source).toContain('useState<ViewMode>("kanban")');
    expect(source).toContain("CompanyKanbanBoard");
    expect(source).toContain('key: "grid"');
  });

  it("moves companies through the narrow phase movement hook", async () => {
    const source = await readFile(new URL("./CompaniesPageClient.tsx", import.meta.url), "utf8");
    expect(source).toContain("moveCompanyToPhase");
    expect(source).toContain("onMoveToPhase");
  });
});
