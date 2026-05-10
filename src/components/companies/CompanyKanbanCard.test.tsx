import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";

describe("CompanyKanbanCard", () => {
  it("uses the shared company logo and keeps company names on one line", async () => {
    const source = await readFile(new URL("./CompanyKanbanCard.tsx", import.meta.url), "utf8");
    expect(source).toContain("CompanyLogo");
    expect(source).toContain("truncate whitespace-nowrap");
    expect(source).toContain("getCompanyNameClass");
  });

  it("keeps a structured card layout with separated information blocks", async () => {
    const source = await readFile(new URL("./CompanyKanbanCard.tsx", import.meta.url), "utf8");
    expect(source).toContain("CardContent");
    expect(source).toContain("更新:");
    expect(source).toContain("Briefcase");
    expect(source).toContain("FileText");
    expect(source).toContain("border-t");
  });
});
