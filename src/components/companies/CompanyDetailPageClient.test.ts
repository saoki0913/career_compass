import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";

describe("CompanyDetailPageClient", () => {
  it("uses StatusDropdown for inline status changes", async () => {
    const source = await readFile(new URL("./CompanyDetailPageClient.tsx", import.meta.url), "utf8");
    expect(source).toContain("StatusDropdown");
    expect(source).toContain("handleStatusChange");
  });
});
