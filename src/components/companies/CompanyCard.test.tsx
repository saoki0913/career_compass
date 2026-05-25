import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";

describe("CompanyCard", () => {
  it("exports component", async () => {
    const mod = await import("./CompanyCard");
    expect(mod.CompanyCard).toBeDefined();
  });

  it("shows the shared company logo and keeps company names on one line", async () => {
    const source = await readFile(new URL("./CompanyCard.tsx", import.meta.url), "utf8");
    expect(source).toContain("CompanyLogo");
    expect(source).toContain("truncate whitespace-nowrap");
  });

  it("uses getCompanyNameClass for dynamic font sizing", async () => {
    const source = await readFile(new URL("./CompanyCard.tsx", import.meta.url), "utf8");
    expect(source).toContain("getCompanyNameClass");
  });

  it("uses Popover for external link menu instead of inline buttons", async () => {
    const source = await readFile(new URL("./CompanyCard.tsx", import.meta.url), "utf8");
    expect(source).toContain("Popover");
    expect(source).toContain("PopoverTrigger");
    expect(source).toContain("PopoverContent");
    expect(source).toContain("MoreHorizontal");
  });

  it("renders stats with bordered box styling", async () => {
    const source = await readFile(new URL("./CompanyCard.tsx", import.meta.url), "utf8");
    expect(source).toContain("border border-border/60");
    expect(source).toContain("bg-card");
  });

  it("does not contain the local formatDeadline function", async () => {
    const source = await readFile(new URL("./CompanyCard.tsx", import.meta.url), "utf8");
    expect(source).not.toContain("const formatDeadline");
  });

  it("uses a compact company logo", async () => {
    const source = await readFile(new URL("./CompanyCard.tsx", import.meta.url), "utf8");
    expect(source).toContain("h-10 w-10");
  });

  it("keeps card navigation keyboard accessible without nesting controls inside a link", async () => {
    const source = await readFile(new URL("./CompanyCard.tsx", import.meta.url), "utf8");
    expect(source).toContain('role="link"');
    expect(source).toContain("tabIndex={0}");
    expect(source).toContain("onKeyDown={handleCardKeyDown}");
    expect(source).toContain("target.closest(\"button, a, [role='button'], [data-radix-popper-content-wrapper]\")");
    expect(source).not.toContain("<Link href={`/companies/${company.id}`}>");
  });

  it("labels independent actions with the company name and pressed state", async () => {
    const source = await readFile(new URL("./CompanyCard.tsx", import.meta.url), "utf8");
    expect(source).toContain("aria-pressed={company.isPinned}");
    expect(source).toContain("`${company.name} をお気に入りに追加`");
    expect(source).toContain("`${company.name} のお気に入りを解除`");
    expect(source).toContain("e.stopPropagation(); }");
  });
});
